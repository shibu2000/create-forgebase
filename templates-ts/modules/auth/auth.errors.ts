import { AppError } from '../../core/errors/AppError.js';

/**
 * Auth error vocabulary.
 *
 * Login and reset failures are deliberately uniform: a caller must not be
 * able to tell "no such user" from "wrong password", or the endpoint becomes
 * an account-enumeration oracle.
 */

export const invalidCredentials = (): AppError =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');

export const accountInactive = (): AppError =>
  new AppError(403, 'ACCOUNT_INACTIVE', 'This account has been deactivated');

export const invalidRefreshToken = (): AppError =>
  new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid, expired or revoked');

export const invalidResetToken = (): AppError =>
  new AppError(400, 'INVALID_RESET_TOKEN', 'Password reset link is invalid, expired or used');

export const missingCredentials = (): AppError =>
  new AppError(401, 'UNAUTHENTICATED', 'Authentication required');

export const invalidAccessToken = (): AppError =>
  new AppError(401, 'INVALID_ACCESS_TOKEN', 'Access token is invalid or expired');

export const forbidden = (action: string): AppError =>
  new AppError(403, 'FORBIDDEN', `This action requires the "${action}" permission`);
