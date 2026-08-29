import { describe, expect, it, jest } from '@jest/globals';

import type {
  AuthUserLookup,
  PasswordResetTokenRepository,
  RefreshTokenRepository,
} from '../../src/modules/auth/auth.repository.interface.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { hashToken } from '../../src/modules/auth/auth.tokens.js';
import type { CreateTokenRecord } from '../../src/modules/auth/auth.types.js';
import { fakeEmailService, fakeHasher, fakeUnitOfWork, repoOf } from '../helpers/mocks.js';

/**
 * Unit tests for the security decisions in the auth service.
 *
 * The point of testing these with fakes is that each rule can be provoked
 * directly — an expired token, a revoked token, a deactivated account — where
 * arranging the same states against a real database would mean either
 * clock-skewing or reaching behind the service to write rows.
 */

const account = {
  id: 'user-1',
  email: 'ada@example.com',
  passwordHash: '',
  isActive: true,
};

function buildService(
  overrides: {
    users?: Partial<AuthUserLookup>;
    refreshTokens?: Partial<RefreshTokenRepository>;
    resetTokens?: Partial<PasswordResetTokenRepository>;
  } = {},
) {
  const mail = fakeEmailService();

  const users: Partial<AuthUserLookup> = {
    findByEmail: jest.fn(async () => account),
    findById: jest.fn(async () => ({ id: account.id, email: account.email, isActive: true })),
    update: jest.fn(async () => undefined),
    findEffectiveActionNames: jest.fn(async () => ['user:read']),
    ...overrides.users,
  };

  const refreshTokens: Partial<RefreshTokenRepository> = {
    create: jest.fn(async (input: CreateTokenRecord) => ({
      id: 'refresh-1',
      userId: input.userId,
      expiresAt: input.expiresAt,
      revokedAt: null,
    })),
    findByHash: jest.fn(async () => null),
    revoke: jest.fn(async () => undefined),
    revokeAllForUser: jest.fn(async () => 3),
    deleteExpired: jest.fn(async () => 0),
    ...overrides.refreshTokens,
  };

  const resetTokens: Partial<PasswordResetTokenRepository> = {
    create: jest.fn(async (input: CreateTokenRecord) => ({
      id: 'reset-1',
      userId: input.userId,
      expiresAt: input.expiresAt,
      usedAt: null,
    })),
    findByHash: jest.fn(async () => null),
    markUsed: jest.fn(async () => undefined),
    invalidateAllForUser: jest.fn(async () => 0),
    ...overrides.resetTokens,
  };

  return {
    users,
    refreshTokens,
    resetTokens,
    mail,
    service: createAuthService({
      users: repoOf(users),
      refreshTokens: repoOf(refreshTokens),
      resetTokens: repoOf(resetTokens),
      uow: fakeUnitOfWork,
      hasher: fakeHasher,
      email: mail.service,
      appUrl: 'https://app.example.com',
    }),
  };
}

describe('createAuthService', () => {
  describe('login', () => {
    it('rejects an unknown account and a wrong password with the same error', async () => {
      const unknown = buildService({ users: { findByEmail: jest.fn(async () => null) } });
      const wrongPassword = buildService();

      const a = await unknown.service
        .login({ email: 'nobody@example.com', password: 'x' })
        .catch((error: unknown) => error);
      const b = await wrongPassword.service
        .login({ email: 'ada@example.com', password: 'wrong' })
        .catch((error: unknown) => error);

      expect((a as { code: string }).code).toBe('INVALID_CREDENTIALS');
      expect((b as { code: string }).code).toBe((a as { code: string }).code);
    });

    it('verifies a hash even when no account matches, so timing does not leak', async () => {
      const { service } = buildService({ users: { findByEmail: jest.fn(async () => null) } });

      await service.login({ email: 'nobody@example.com', password: 'x' }).catch(() => undefined);

      // The work is what matters: without it, a missing account returns far
      // faster than a wrong password and the endpoint enumerates accounts.
      expect(fakeHasher.verify).toHaveBeenCalled();
    });

    it('refuses a deactivated account', async () => {
      const passwordHash = await fakeHasher.hash('correct password');
      const { service } = buildService({
        users: {
          findByEmail: jest.fn(async () => ({ ...account, passwordHash, isActive: false })),
        },
      });

      await expect(
        service.login({ email: 'ada@example.com', password: 'correct password' }),
      ).rejects.toMatchObject({ code: 'ACCOUNT_INACTIVE' });
    });
  });

  describe('refresh', () => {
    it('revokes every session when a rotated token is presented again', async () => {
      const { refreshTokens, service } = buildService({
        refreshTokens: {
          findByHash: jest.fn(async () => ({
            id: 'refresh-1',
            userId: 'user-1',
            expiresAt: new Date(Date.now() + 60_000),
            revokedAt: new Date(),
          })),
        },
      });

      await expect(service.refresh({ refreshToken: 'stolen' })).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      });

      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });

    it('rejects an expired token without revoking anything', async () => {
      const { refreshTokens, service } = buildService({
        refreshTokens: {
          findByHash: jest.fn(async () => ({
            id: 'refresh-1',
            userId: 'user-1',
            expiresAt: new Date(Date.now() - 1),
            revokedAt: null,
          })),
        },
      });

      await expect(service.refresh({ refreshToken: 'old' })).rejects.toMatchObject({
        code: 'INVALID_REFRESH_TOKEN',
      });

      // Expiry is ordinary, not evidence of theft.
      expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('stores only a hash of the token, never the token itself', async () => {
      const { resetTokens, mail, service } = buildService();

      await service.forgotPassword({ email: 'ada@example.com' });

      const link = mail.sent[0]?.text ?? '';
      const token = /token=([A-Za-z0-9_-]+)/.exec(link)?.[1] ?? '';
      expect(token.length).toBeGreaterThan(20);

      const [stored] = (resetTokens.create as jest.Mock).mock.calls[0] as [{ tokenHash: string }];
      expect(stored.tokenHash).toBe(hashToken(token));
      expect(stored.tokenHash).not.toBe(token);
    });

    it('sends nothing for an unknown address, and does not report that', async () => {
      const { mail, service } = buildService({ users: { findByEmail: jest.fn(async () => null) } });

      await expect(
        service.forgotPassword({ email: 'nobody@example.com' }),
      ).resolves.toBeUndefined();
      expect(mail.sent).toHaveLength(0);
    });

    it('invalidates earlier reset links before issuing a new one', async () => {
      const { resetTokens, service } = buildService();

      await service.forgotPassword({ email: 'ada@example.com' });
      expect(resetTokens.invalidateAllForUser).toHaveBeenCalledWith('user-1');
    });
  });

  describe('resetPassword', () => {
    it('refuses a token that was already used', async () => {
      const { service } = buildService({
        resetTokens: {
          findByHash: jest.fn(async () => ({
            id: 'reset-1',
            userId: 'user-1',
            expiresAt: new Date(Date.now() + 60_000),
            usedAt: new Date(),
          })),
        },
      });

      await expect(
        service.resetPassword({ token: 'used', password: 'a brand new password' }),
      ).rejects.toMatchObject({ code: 'INVALID_RESET_TOKEN' });
    });

    it('revokes every session after a successful reset', async () => {
      const { refreshTokens, service } = buildService({
        resetTokens: {
          findByHash: jest.fn(async () => ({
            id: 'reset-1',
            userId: 'user-1',
            expiresAt: new Date(Date.now() + 60_000),
            usedAt: null,
          })),
        },
      });

      await service.resetPassword({ token: 'valid', password: 'a brand new password' });
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });
  });
});
