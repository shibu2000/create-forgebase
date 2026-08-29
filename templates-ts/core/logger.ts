import pino, { type Logger, type LoggerOptions } from 'pino';

import { env, isProduction } from './env.js';

/**
 * Fields stripped from every log record before it is written.
 *
 * Pino applies redaction at serialization time, so this holds even when a
 * secret is nested inside an object someone logged wholesale. It is a hard
 * guarantee rather than a convention — never rely on call sites remembering
 * to omit credentials.
 *
 * Pino path wildcards match a single level, so the common shapes are listed
 * explicitly instead of relying on one catch-all pattern.
 */
export const redactPaths = [
  // Request/response headers
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-refresh-token"]',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',

  // Credentials, at the root and one level deep (body.*, user.*, data.*, ...)
  'password',
  '*.password',
  '*.*.password',
  'newPassword',
  '*.newPassword',
  'currentPassword',
  '*.currentPassword',
  'passwordHash',
  '*.passwordHash',
  'password_hash',
  '*.password_hash',

  // Tokens
  'token',
  '*.token',
  '*.*.token',
  'tokenHash',
  '*.tokenHash',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'access_token',
  '*.access_token',
  'refresh_token',
  '*.refresh_token',
  'authorization',
  '*.authorization',

  // Secrets pulled in by later fragments
  'secret',
  '*.secret',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'SMTP_PASS',
  'DATABASE_URL',
] as const;

export const REDACTED = '[REDACTED]';

const options: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: [...redactPaths],
    censor: REDACTED,
  },
  // Structured JSON everywhere except local development.
  ...(isProduction
    ? {
        formatters: {
          level: (label: string) => ({ level: label }),
        },
      }
    : {}),
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
};

export const logger: Logger = pino(options);

/** Child logger tagged with a subsystem name, e.g. `createLogger('db')`. */
export function createLogger(name: string): Logger {
  return logger.child({ name });
}
