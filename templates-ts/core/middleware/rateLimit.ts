import rateLimit, { type Options } from 'express-rate-limit';

import { env, isTest } from '../env.js';
import { errorBody } from '../response.js';

/**
 * Rate limiters for credential-handling endpoints.
 *
 * Applied at the route level (`/auth/login`, `/auth/forgot-password`) rather
 * than globally, so ordinary API traffic is unaffected.
 *
 * The default in-memory store is per-process. Behind more than one instance,
 * swap in a shared store (e.g. `rate-limit-redis`) here — the call sites do
 * not change.
 */

const base: Partial<Options> = {
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Tests exercise handlers directly; a shared counter across cases would
  // make them order-dependent.
  skip: () => isTest,
  handler(_req, res) {
    res.status(429).json(errorBody('RATE_LIMITED', 'Too many requests, please try again later.'));
  },
};

/** Login and other credential-verifying endpoints. */
export const authRateLimiter = rateLimit({
  ...base,
  limit: env.RATE_LIMIT_MAX,
});

/**
 * Password reset requests. Deliberately tighter than login: each accepted
 * request sends an email.
 */
export const passwordResetRateLimiter = rateLimit({
  ...base,
  limit: Math.max(1, Math.ceil(env.RATE_LIMIT_MAX / 2)),
});
