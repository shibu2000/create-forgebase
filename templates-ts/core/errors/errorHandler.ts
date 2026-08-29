import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { isProduction } from '../env.js';
import { logger } from '../logger.js';
import { errorBody } from '../response.js';

import { AppError, isAppError } from './AppError.js';

interface NormalisedError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  /** False for unexpected faults, which are logged with their stack. */
  operational: boolean;
}

/** Shape body-parser attaches to its own failures. */
interface BodyParserError extends Error {
  type?: string;
  status?: number;
  statusCode?: number;
}

function zodDetails(error: ZodError): { path: string; message: string; code: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

function normalise(error: unknown): NormalisedError {
  if (isAppError(error)) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
      operational: true,
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: zodDetails(error),
      operational: true,
    };
  }

  if (error instanceof Error) {
    const candidate = error as BodyParserError;

    // express.json() / express.urlencoded() rejections
    if (candidate.type === 'entity.too.large') {
      return {
        statusCode: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body exceeds the maximum allowed size',
        operational: true,
      };
    }

    if (candidate.type === 'entity.parse.failed' || error instanceof SyntaxError) {
      return {
        statusCode: 400,
        code: 'MALFORMED_JSON',
        message: 'Request body is not valid JSON',
        operational: true,
      };
    }

    if (candidate.type === 'encoding.unsupported') {
      return {
        statusCode: 415,
        code: 'UNSUPPORTED_ENCODING',
        message: 'Unsupported content encoding',
        operational: true,
      };
    }
  }

  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    operational: false,
  };
}

/**
 * Terminal error middleware. Must be registered last, after every route and
 * after `notFoundHandler`.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  // Nothing useful we can do once the response has started streaming.
  if (res.headersSent) {
    next(error);
    return;
  }

  const { statusCode, code, message, details, operational } = normalise(error);
  const log = req.log ?? logger;

  if (!operational || statusCode >= 500) {
    log.error({ err: error, code, statusCode }, 'Unhandled error while serving request');
  } else {
    log.warn({ code, statusCode, message }, 'Request failed');
  }

  // Never leak internals of an unexpected fault to the client.
  const clientMessage = operational || !isProduction ? message : 'Internal server error';
  const clientDetails = operational ? details : undefined;

  res.status(statusCode).json(errorBody(code, clientMessage, clientDetails));
};

/** Registered after all routes, before `errorHandler`. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`, 'ROUTE_NOT_FOUND'));
};
