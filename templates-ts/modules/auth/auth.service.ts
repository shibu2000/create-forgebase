import { randomBytes } from 'node:crypto';

import { createLogger } from '../../core/logger.js';
import type { Repo, UnitOfWork } from '../../db/unit-of-work.js';
import type { EmailService } from '../../services/email/email.service.interface.js';
import type { PasswordHasher } from '../../services/password/password.service.js';

import { authConfig } from './auth.config.js';
import {
  accountInactive,
  invalidCredentials,
  invalidRefreshToken,
  invalidResetToken,
} from './auth.errors.js';
import type {
  AuthUserLookup,
  PasswordResetTokenRepository,
  RefreshTokenRepository,
} from './auth.repository.interface.js';
import type {
  ForgotPasswordBody,
  LoginBody,
  LogoutBody,
  RefreshBody,
  ResetPasswordBody,
} from './auth.schema.js';
import { expiryFromNow, generateOpaqueToken, hashToken, signAccessToken } from './auth.tokens.js';
import type { AuthenticatedUser, IssuedTokens } from './auth.types.js';

const log = createLogger('auth');

/**
 * A real Argon2id hash of a throwaway value, verified against when no user
 * matches so a failed lookup costs the same as a wrong password. Without it,
 * login latency alone reveals which addresses are registered.
 *
 * Computed once, lazily, with the live hasher — a hardcoded literal would not
 * survive a parameter change, and a malformed one would be rejected before
 * doing any work, which is exactly the timing signal being defended against.
 */
let dummyHash: Promise<string> | undefined;

function getDummyHash(hasher: PasswordHasher): Promise<string> {
  dummyHash ??= hasher.hash(randomBytes(32).toString('base64'));
  return dummyHash;
}

export interface AuthServiceDeps {
  users: Repo<AuthUserLookup>;
  refreshTokens: Repo<RefreshTokenRepository>;
  resetTokens: Repo<PasswordResetTokenRepository>;
  uow: UnitOfWork;
  hasher: PasswordHasher;
  email: EmailService;
  /** Base URL used to build the reset link. */
  appUrl: string;
}

export function createAuthService({
  users,
  refreshTokens,
  resetTokens,
  uow,
  hasher,
  email,
  appUrl,
}: AuthServiceDeps) {
  /** Mints an access token and a fresh refresh token, recording the latter. */
  async function issueTokens(user: { id: string; email: string }): Promise<IssuedTokens> {
    const refreshToken = generateOpaqueToken();

    await refreshTokens().create({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: expiryFromNow(authConfig.REFRESH_TTL_SECONDS),
    });

    return {
      accessToken: await signAccessToken({ sub: user.id, email: user.email }),
      refreshToken,
      expiresIn: authConfig.JWT_ACCESS_TTL_SECONDS,
      tokenType: 'Bearer',
    };
  }

  async function login(body: LoginBody): Promise<IssuedTokens> {
    const user = await users().findByEmail(body.email);

    // Verify a hash even when no user exists, so the response time does not
    // reveal whether the address is registered.
    const storedHash = user?.passwordHash ?? (await getDummyHash(hasher));
    const passwordMatches = await hasher.verify(storedHash, body.password);

    if (!user || !passwordMatches) throw invalidCredentials();
    if (!user.isActive) throw accountInactive();

    log.info({ userId: user.id }, 'User logged in');
    return issueTokens(user);
  }

  /**
   * Exchanges a refresh token for a new pair, rotating it.
   *
   * Rotation means a token is single-use. If one is presented twice, either
   * it was stolen or the legitimate client replayed it — and we cannot tell
   * which, so every session for that user is revoked. That turns a silent
   * compromise into a visible logout.
   */
  async function refresh(body: RefreshBody): Promise<IssuedTokens> {
    const tokenHash = hashToken(body.refreshToken);

    const existing = await refreshTokens().findByHash(tokenHash);
    if (!existing) throw invalidRefreshToken();

    if (existing.revokedAt) {
      // Deliberately outside a transaction. This request is about to fail,
      // and the breach response has to survive that failure — revoking
      // inside the rotation transaction would be rolled back by the very
      // throw that rejects the caller, leaving the stolen sessions alive.
      const revoked = await refreshTokens().revokeAllForUser(existing.userId);
      log.warn(
        { userId: existing.userId, revoked },
        'Reused refresh token presented — all sessions revoked',
      );
      throw invalidRefreshToken();
    }

    return uow.run(async (tx) => {
      // Re-read inside the transaction: two concurrent refreshes with the
      // same token must not both succeed.
      const record = await refreshTokens(tx).findByHash(tokenHash);
      if (!record || record.revokedAt) throw invalidRefreshToken();

      if (record.expiresAt.getTime() <= Date.now()) throw invalidRefreshToken();

      const user = await users(tx).findById(record.userId);
      if (!user) throw invalidRefreshToken();
      if (!user.isActive) throw accountInactive();

      await refreshTokens(tx).revoke(record.id);

      const refreshToken = generateOpaqueToken();
      await refreshTokens(tx).create({
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: expiryFromNow(authConfig.REFRESH_TTL_SECONDS),
      });

      return {
        accessToken: await signAccessToken({ sub: user.id, email: user.email }),
        refreshToken,
        expiresIn: authConfig.JWT_ACCESS_TTL_SECONDS,
        tokenType: 'Bearer' as const,
      };
    });
  }

  /**
   * Revokes the refresh token server-side — a real state change, not a
   * client-side cookie deletion. Always reports success: telling a caller
   * that a token was already invalid leaks information and helps nobody.
   */
  async function logout(body: LogoutBody): Promise<void> {
    const record = await refreshTokens().findByHash(hashToken(body.refreshToken));

    if (record && !record.revokedAt) {
      await refreshTokens().revoke(record.id);
      log.info({ userId: record.userId }, 'User logged out');
    }
  }

  /**
   * Starts a password reset.
   *
   * Always resolves the same way whether or not the address exists — this
   * endpoint is unauthenticated, so any difference in status, body or timing
   * turns it into an account-enumeration oracle.
   */
  async function forgotPassword(body: ForgotPasswordBody): Promise<void> {
    const user = await users().findByEmail(body.email);

    if (!user?.isActive) {
      log.info({ email: body.email }, 'Password reset requested for unknown or inactive account');
      return;
    }

    const token = generateOpaqueToken();

    await uow.run(async (tx) => {
      // Only the newest link should work; older ones may be in an inbox or a
      // proxy log somewhere.
      await resetTokens(tx).invalidateAllForUser(user.id);
      await resetTokens(tx).create({
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: expiryFromNow(authConfig.PASSWORD_RESET_TTL_SECONDS),
      });
    });

    const link = `${appUrl.replace(/\/$/, '')}/reset-password?token=${token}`;
    const minutes = Math.round(authConfig.PASSWORD_RESET_TTL_SECONDS / 60);

    await email.send({
      to: user.email,
      subject: 'Reset your password',
      text: [
        'We received a request to reset your password.',
        '',
        `Open this link to choose a new one: ${link}`,
        '',
        `The link expires in ${minutes} minutes and can only be used once.`,
        'If you did not request this, you can ignore this message.',
      ].join('\n'),
    });

    log.info({ userId: user.id }, 'Password reset email dispatched');
  }

  /**
   * Completes a reset: sets the new password, consumes the token, and
   * revokes every existing session — a reset is how someone recovers a
   * compromised account, so any session an attacker holds must die with it.
   */
  async function resetPassword(body: ResetPasswordBody): Promise<void> {
    const tokenHash = hashToken(body.token);
    const passwordHash = await hasher.hash(body.password);

    await uow.run(async (tx) => {
      const record = await resetTokens(tx).findByHash(tokenHash);

      if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
        throw invalidResetToken();
      }

      await users(tx).update(record.userId, { passwordHash });
      await resetTokens(tx).markUsed(record.id);

      const revoked = await refreshTokens(tx).revokeAllForUser(record.userId);
      log.info({ userId: record.userId, revoked }, 'Password reset; all sessions revoked');
    });
  }

  /** Loads the identity `authenticate` attaches to a request. */
  async function loadAuthenticatedUser(userId: string): Promise<AuthenticatedUser | null> {
    const user = await users().findById(userId);
    if (!user?.isActive) return null;

    return {
      id: user.id,
      email: user.email,
      actions: await users().findEffectiveActionNames(user.id),
    };
  }

  return {
    login,
    refresh,
    logout,
    forgotPassword,
    resetPassword,
    loadAuthenticatedUser,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
