import type { Response } from 'express';

/**
 * The single response envelope every controller in this project returns.
 * Clients can rely on `success` to discriminate without inspecting the
 * status code.
 */

export type ResponseMeta = Record<string, unknown>;

export interface SuccessBody<T> {
  success: true;
  data: T;
  meta: ResponseMeta;
}

export interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginationMeta extends ResponseMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface SuccessOptions {
  status?: number;
  meta?: ResponseMeta;
}

export function successBody<T>(data: T, meta: ResponseMeta = {}): SuccessBody<T> {
  return { success: true, data, meta };
}

export function errorBody(code: string, message: string, details?: unknown): ErrorBody {
  return {
    success: false,
    error: details === undefined ? { code, message } : { code, message, details },
  };
}

/** 200 by default. */
export function sendSuccess<T>(res: Response, data: T, options: SuccessOptions = {}): Response {
  const { status = 200, meta = {} } = options;
  return res.status(status).json(successBody(data, meta));
}

/** 201 with the created resource. */
export function sendCreated<T>(res: Response, data: T, meta: ResponseMeta = {}): Response {
  return sendSuccess(res, data, { status: 201, meta });
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return res.status(status).json(errorBody(code, message, details));
}

/** Builds the `meta` block for a paginated list response. */
export function paginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}
