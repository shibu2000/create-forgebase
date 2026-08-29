import { AppError } from '../../core/errors/AppError.js';

/**
 * Error vocabulary for the user module. Codes are stable strings a client can
 * branch on; messages are for humans.
 */

export const userNotFound = (id: string): AppError =>
  new AppError(404, 'USER_NOT_FOUND', `No user with id ${id}`);

export const emailTaken = (): AppError =>
  new AppError(409, 'EMAIL_TAKEN', 'A user with that email address already exists');

export const unknownRoles = (ids: string[]): AppError =>
  new AppError(422, 'UNKNOWN_ROLES', 'One or more roles do not exist', { roleIds: ids });
