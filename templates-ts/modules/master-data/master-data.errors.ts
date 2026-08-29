import { AppError } from '../../core/errors/AppError.js';

export const typeNotFound = (code: string): AppError =>
  new AppError(404, 'MASTER_DATA_TYPE_NOT_FOUND', `No master data type with code "${code}"`);

export const typeCodeTaken = (): AppError =>
  new AppError(
    409,
    'MASTER_DATA_TYPE_CODE_TAKEN',
    'A master data type with that code already exists',
  );

export const itemNotFound = (typeCode: string, code: string): AppError =>
  new AppError(404, 'MASTER_DATA_ITEM_NOT_FOUND', `No item "${code}" under type "${typeCode}"`);

export const itemCodeTaken = (): AppError =>
  new AppError(
    409,
    'MASTER_DATA_ITEM_CODE_TAKEN',
    'An item with that code already exists for this type',
  );
