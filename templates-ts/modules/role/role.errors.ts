import { AppError } from '../../core/errors/AppError.js';

export const roleNotFound = (id: string): AppError =>
  new AppError(404, 'ROLE_NOT_FOUND', `No role with id ${id}`);

export const roleNameTaken = (): AppError =>
  new AppError(409, 'ROLE_NAME_TAKEN', 'A role with that name already exists');

export const unknownActions = (ids: string[]): AppError =>
  new AppError(422, 'UNKNOWN_ACTIONS', 'One or more actions do not exist', { actionIds: ids });
