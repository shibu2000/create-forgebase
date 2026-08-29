import type { RequestHandler } from 'express';

import { sendSuccess } from '../../core/response.js';

import type {
  ForgotPasswordBody,
  LoginBody,
  LogoutBody,
  RefreshBody,
  ResetPasswordBody,
} from './auth.schema.js';
import type { AuthService } from './auth.service.js';

export function createAuthController(service: AuthService) {
  const login: RequestHandler = async (req, res) => {
    sendSuccess(res, await service.login(req.validated.body as LoginBody));
  };

  const refresh: RequestHandler = async (req, res) => {
    sendSuccess(res, await service.refresh(req.validated.body as RefreshBody));
  };

  const logout: RequestHandler = async (req, res) => {
    await service.logout(req.validated.body as LogoutBody);
    sendSuccess(res, { loggedOut: true });
  };

  const forgotPassword: RequestHandler = async (req, res) => {
    await service.forgotPassword(req.validated.body as ForgotPasswordBody);

    // Identical response whether or not the address exists — see the service.
    sendSuccess(res, {
      message: 'If an account exists for that address, a reset link has been sent.',
    });
  };

  const resetPassword: RequestHandler = async (req, res) => {
    await service.resetPassword(req.validated.body as ResetPasswordBody);
    sendSuccess(res, { message: 'Password updated. Please sign in again.' });
  };

  /** The caller's own identity and effective permissions. */
  const me: RequestHandler = async (req, res) => {
    sendSuccess(res, req.user);
  };

  return { login, refresh, logout, forgotPassword, resetPassword, me };
}
