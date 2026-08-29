import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';

import { type Options, pinoHttp } from 'pino-http';

import { logger } from '../logger.js';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Accept an upstream correlation id only if it is short and printable. */
const SAFE_REQUEST_ID = /^[\w.:-]{1,128}$/;

function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const id = candidate && SAFE_REQUEST_ID.test(candidate) ? candidate : randomUUID();

  // Echo it back so clients and downstream services can correlate.
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

/**
 * Shapes pino-http hands its serializers.
 *
 * The library types these as `any`, which would silently spread through every
 * field below. Declaring what is actually read keeps the serializers
 * type-checked and satisfies the no-unsafe-* rules honestly rather than by
 * suppression.
 */
interface LoggedRequest {
  id?: string;
  method?: string;
  url?: string;
  remoteAddress?: string;
  headers: IncomingHttpHeaders;
}

interface LoggedResponse {
  statusCode: number;
}

const options: Options = {
  logger,
  genReqId: resolveRequestId,

  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },

  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },

  customErrorMessage(req, res, err) {
    return `${req.method} ${req.url} ${res.statusCode} ${err.message}`;
  },

  autoLogging: {
    // Liveness probes would otherwise dominate the log volume.
    ignore: (req) => (req.url ?? '').startsWith('/health'),
  },

  serializers: {
    req(req: LoggedRequest) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
        // Headers are included so pino's redaction paths have something to
        // act on; sensitive ones are censored by the logger config.
        headers: {
          host: req.headers.host,
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type'],
        },
      };
    },
    res(res: LoggedResponse) {
      return { statusCode: res.statusCode };
    },
  },
};

/**
 * Per-request logging with a correlation id. Attaches `req.log`, a child
 * logger already bound to that id, which the error handler and services
 * reuse so every line from one request shares a `reqId`.
 */
export const requestLogger = pinoHttp(options);
