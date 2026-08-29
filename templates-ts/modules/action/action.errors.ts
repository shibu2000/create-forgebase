import { AppError } from '../../core/errors/AppError.js';

export const actionNotFound = (id: string): AppError =>
  new AppError(404, 'ACTION_NOT_FOUND', `No action with id ${id}`);

export const actionNameTaken = (): AppError =>
  new AppError(409, 'ACTION_NAME_TAKEN', 'An action with that name already exists');
