import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

import { authConfig } from './auth.config.js';
import type { AccessTokenClaims } from './auth.types.js';

/**
 * Token minting and verification.
 *
 * Two kinds of token, deliberately built differently:
 *
 * **Access tokens are JWTs.** They are checked on every request, so being
 * verifiable from the signature alone — no database round trip — is the whole
 * point. Kept short-lived because nothing can revoke one early.
 *
 * **Refresh tokens are opaque random strings**, not JWTs. Every refresh is
 * checked against the database anyway to see whether it was revoked, so a
 * signature would add size and a second source of truth for expiry while
 * buying nothing. An opaque token also carries no readable claims if it
 * leaks. This is the OAuth 2.0 security BCP's recommendation.
 */

const accessSecret = new TextEncoder().encode(authConfig.JWT_ACCESS_SECRET);

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(authConfig.JWT_ISSUER)
    .setAudience(authConfig.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${authConfig.JWT_ACCESS_TTL_SECONDS}s`)
    .sign(accessSecret);
}

/**
 * Verifies signature, expiry, issuer and audience. Throws on any failure —
 * callers translate that into a 401.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, accessSecret, {
    issuer: authConfig.JWT_ISSUER,
    audience: authConfig.JWT_AUDIENCE,
    algorithms: ['HS256'],
  });

  if (!payload.sub || typeof payload.email !== 'string') {
    throw new Error('Access token is missing required claims');
  }

  return { sub: payload.sub, email: payload.email };
}

/**
 * A refresh or reset token: 32 random bytes, base64url encoded.
 *
 * 256 bits of entropy is far beyond brute-force reach, which is what lets the
 * stored form be a fast hash rather than a slow one.
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hashes a token for storage.
 *
 * SHA-256, not Argon2 — and that difference is deliberate. Argon2 exists to
 * make guessing *low-entropy* human passwords expensive. These tokens are 256
 * random bits, so there is nothing to guess; a slow hash would only add
 * latency to every refresh. What matters here is that a database leak does
 * not hand out usable tokens, and a one-way hash achieves that.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison, for anywhere a hash is compared in application code. */
export function tokenHashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');

  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function expiryFromNow(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}
