import type { CreateTokenRecord, PasswordResetRecord, RefreshTokenRecord } from './auth.types.js';

/**
 * Persistence contracts for the auth module.
 *
 * Tokens are looked up by hash, never by plaintext — the plaintext exists
 * only in the client's possession and, briefly, in memory here.
 */

export interface RefreshTokenRepository {
  create(input: CreateTokenRecord): Promise<RefreshTokenRecord>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revoke(id: string): Promise<void>;
  /**
   * Revokes every live token for a user. Used on password change, and on
   * detecting a reused refresh token.
   */
  revokeAllForUser(userId: string): Promise<number>;
  /** Housekeeping: drop rows that are expired or long revoked. */
  deleteExpired(before: Date): Promise<number>;
}

export interface PasswordResetTokenRepository {
  create(input: CreateTokenRecord): Promise<PasswordResetRecord>;
  findByHash(tokenHash: string): Promise<PasswordResetRecord | null>;
  markUsed(id: string): Promise<void>;
  /** Invalidates any outstanding reset requests for a user. */
  invalidateAllForUser(userId: string): Promise<number>;
}

/**
 * The slice of the user module auth needs, declared here rather than
 * imported — so `auth` and `user` remain independent modules that the
 * composition root wires together.
 */
export interface AuthUserLookup {
  findByEmail(email: string): Promise<{
    id: string;
    email: string;
    passwordHash: string;
    isActive: boolean;
  } | null>;

  findById(id: string): Promise<{ id: string; email: string; isActive: boolean } | null>;

  update(id: string, input: { passwordHash?: string }): Promise<unknown>;

  /** Resolves the caller's effective permissions for `authorize()`. */
  findEffectiveActionNames(userId: string): Promise<string[]>;
}
