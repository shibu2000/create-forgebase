import { type RequestHandler, Router } from 'express';

import { authRateLimiter, passwordResetRateLimiter } from '../../core/middleware/rateLimit.js';
import { describe } from '../../core/middleware/route-metadata.js';
import { validate } from '../../core/middleware/validate.js';

import { createAuthController } from './auth.controller.js';
import {
  forgotPasswordBody,
  loginBody,
  logoutBody,
  refreshBody,
  resetPasswordBody,
} from './auth.schema.js';
import { type AuthServiceDeps, createAuthService } from './auth.service.js';

/**
 * Auth routes.
 *
 * Unlike every other module these are mostly public — they are how a caller
 * obtains credentials in the first place. That is exactly why the
 * credential-handling endpoints carry rate limiters: they are reachable
 * without a token, and each one either verifies a secret or sends an email.
 */

export interface AuthRouterDeps extends AuthServiceDeps {
  /** Applied only to `/auth/me`; the rest of this router is public. */
  authenticate: RequestHandler;
}

export function createAuthRouter({ authenticate, ...serviceDeps }: AuthRouterDeps): Router {
  const router = Router();
  const controller = createAuthController(createAuthService(serviceDeps));

  router.post(
    '/login',
    authRateLimiter,
    validate({ body: loginBody }),
    describe(
      controller.login,
      'Sign in',
      'Exchanges credentials for an access token and a refresh token.',
    ),
  );

  // Rotation makes a refresh token single-use, so brute-forcing one is
  // pointless — but the endpoint is still public and worth limiting.
  router.post(
    '/refresh',
    authRateLimiter,
    validate({ body: refreshBody }),
    describe(
      controller.refresh,
      'Refresh tokens',
      'Exchanges a valid refresh token for a new pair.',
    ),
  );

  router.post(
    '/logout',
    validate({ body: logoutBody }),
    describe(controller.logout, 'Sign out', 'Revokes the supplied refresh token.'),
  );

  router.post(
    '/forgot-password',
    passwordResetRateLimiter,
    validate({ body: forgotPasswordBody }),
    describe(
      controller.forgotPassword,
      'Request a password reset',
      'Always succeeds, whether or not the address is known.',
    ),
  );

  router.post(
    '/reset-password',
    authRateLimiter,
    validate({ body: resetPasswordBody }),
    describe(
      controller.resetPassword,
      'Reset a password',
      'Consumes a reset token and invalidates existing sessions.',
    ),
  );

  // The one authenticated route here: who am I, and what may I do.
  router.get(
    '/me',
    authenticate,
    describe(
      controller.me,
      'Current user',
      'The authenticated caller, with every action they hold.',
    ),
  );

  return router;
}
