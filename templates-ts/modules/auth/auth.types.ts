/**
 * Domain types for the auth module.
 */

/** What `authenticate` attaches to the request. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  /**
   * The union of action names granted by the user's roles, resolved per
   * request. `authorize()` checks against this and nothing else.
   */
  actions: string[];
}

export interface AccessTokenClaims {
  /** Subject — the user id. */
  sub: string;
  email: string;
}

export interface IssuedTokens {
  accessToken: string;
  /** Opaque, high-entropy, stored only as a hash. */
  refreshToken: string;
  /** Seconds until the access token expires, for the client to schedule refresh. */
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface PasswordResetRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface CreateTokenRecord {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}
