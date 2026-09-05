import { type RequestHandler, Router } from 'express';

import { authRateLimiter, passwordResetRateLimiter } from '../../core/middleware/rateLimit.js';
import { describe } from '../../core/middleware/route-metadata.js';
import { validate } from '../../core/middleware/validate.js';
import { sendSuccess } from '../../core/response.js';

import { type AuthControllerDeps, createAuthController } from './auth.controller.js';
import {
  type ForgotPasswordBody,
  forgotPasswordBody,
  type LoginBody,
  loginBody,
  type LogoutBody,
  logoutBody,
  type RefreshBody,
  refreshBody,
  type ResetPasswordBody,
  resetPasswordBody,
} from './auth.schema.js';

/**
 * Route table for `/auth`. The logic behind each endpoint is in
 * `auth.controller`.
 *
 * Unlike every other module these are mostly public — they are how a caller
 * obtains credentials in the first place. That is exactly why the
 * credential-handling endpoints carry rate limiters: they are reachable
 * without a token, and each one either verifies a secret or sends an email.
 */

export interface AuthRouterDeps extends AuthControllerDeps {
  /** Applied only to `/auth/me`; the rest of this router is public. */
  authenticate: RequestHandler;
}

export function createAuthRouter({ authenticate, ...deps }: AuthRouterDeps): Router {
  const router = Router();
  const controller = createAuthController(deps);

  router.post(
    '/login',
    authRateLimiter,
    validate({ body: loginBody }),
    describe(
      async (req, res) => {
        sendSuccess(res, await controller.login(req.validated.body as LoginBody));
      },
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
      async (req, res) => {
        sendSuccess(res, await controller.refresh(req.validated.body as RefreshBody));
      },
      'Refresh tokens',
      'Exchanges a valid refresh token for a new pair.',
    ),
  );

  router.post(
    '/logout',
    validate({ body: logoutBody }),
    describe(
      async (req, res) => {
        await controller.logout(req.validated.body as LogoutBody);
        sendSuccess(res, { loggedOut: true });
      },
      'Sign out',
      'Revokes the supplied refresh token.',
    ),
  );

  router.post(
    '/forgot-password',
    passwordResetRateLimiter,
    validate({ body: forgotPasswordBody }),
    describe(
      async (req, res) => {
        await controller.forgotPassword(req.validated.body as ForgotPasswordBody);

        // Identical response whether or not the address exists — see the
        // controller for why.
        sendSuccess(res, {
          message: 'If an account exists for that address, a reset link has been sent.',
        });
      },
      'Request a password reset',
      'Always succeeds, whether or not the address is known.',
    ),
  );

  router.post(
    '/reset-password',
    authRateLimiter,
    validate({ body: resetPasswordBody }),
    describe(
      async (req, res) => {
        await controller.resetPassword(req.validated.body as ResetPasswordBody);
        sendSuccess(res, { message: 'Password updated. Please sign in again.' });
      },
      'Reset a password',
      'Consumes a reset token and invalidates existing sessions.',
    ),
  );

  // The one authenticated route here: who am I, and what may I do. The guard
  // has already resolved the caller, so there is nothing for the controller
  // to do.
  router.get(
    '/me',
    authenticate,
    describe(
      (req, res) => {
        sendSuccess(res, req.user);
      },
      'Current user',
      'The authenticated caller, with every action they hold.',
    ),
  );

  return router;
}
