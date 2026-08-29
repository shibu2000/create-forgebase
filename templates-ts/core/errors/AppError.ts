/**
 * Application error carrying everything the HTTP layer needs to build a
 * response envelope: a status code, a stable machine-readable `code`, and a
 * message that is safe to show a client.
 *
 * Anything thrown that is NOT an AppError is treated as an unexpected fault:
 * it is logged at error level and reported to the client as a generic 500
 * with no internal detail.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  /** Expected, handled condition — as opposed to a bug or a downed dependency. */
  readonly isOperational = true;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message = 'Bad request', code = 'BAD_REQUEST', details?: unknown): AppError {
    return new AppError(400, code, message, details);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED'): AppError {
    return new AppError(401, code, message);
  }

  static forbidden(message = 'Insufficient permissions', code = 'FORBIDDEN'): AppError {
    return new AppError(403, code, message);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND'): AppError {
    return new AppError(404, code, message);
  }

  static conflict(message = 'Resource already exists', code = 'CONFLICT'): AppError {
    return new AppError(409, code, message);
  }

  static unprocessable(
    message = 'Validation failed',
    code = 'VALIDATION_ERROR',
    details?: unknown,
  ): AppError {
    return new AppError(422, code, message, details);
  }

  static tooManyRequests(message = 'Too many requests', code = 'RATE_LIMITED'): AppError {
    return new AppError(429, code, message);
  }

  static internal(message = 'Internal server error', code = 'INTERNAL_ERROR'): AppError {
    return new AppError(500, code, message);
  }

  static serviceUnavailable(
    message = 'Service unavailable',
    code = 'SERVICE_UNAVAILABLE',
  ): AppError {
    return new AppError(503, code, message);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
