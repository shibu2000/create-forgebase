import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

// forgebase:app-imports — scaffolded fragments import their routers here

import { AppError } from './errors/AppError.js';
import { errorHandler, notFoundHandler } from './errors/errorHandler.js';
import { REQUEST_ID_HEADER, requestLogger } from './middleware/requestLogger.js';
import { mountRouter } from './middleware/route-metadata.js';
import { healthRouter } from './routes/health.js';
import { env, isProduction, trustProxySetting } from './env.js';
import { logger } from './logger.js';

/**
 * Cross-origin policy driven entirely by CORS_ORIGINS. An empty list denies
 * all cross-origin browser traffic, which is the safe default — it is never
 * implicitly wide open.
 */
function buildCorsOptions(): CorsOptions {
  const allowed = new Set(env.CORS_ORIGINS);

  return {
    origin(origin, callback) {
      // No Origin header: same-origin navigation, curl, server-to-server.
      // CORS is a browser mechanism, so there is nothing to enforce here.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowed.has(origin)) {
        callback(null, true);
        return;
      }

      callback(AppError.forbidden(`Origin ${origin} is not allowed`, 'CORS_ORIGIN_DENIED'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', REQUEST_ID_HEADER],
    exposedHeaders: [REQUEST_ID_HEADER],
    maxAge: 86_400,
  };
}

/**
 * Optional hook for mounting extra routers between the built-in routes and
 * the 404/error handlers. Tests use it to exercise the middleware chain;
 * scaffolded modules are injected statically at the marker below.
 */
export type ConfigureRoutes = (app: Express) => void;

export function createApp(configure?: ConfigureRoutes): Express {
  const app = express();

  // Required for correct client IPs (rate limiting, logs) behind a proxy.
  app.set('trust proxy', trustProxySetting());
  app.disable('x-powered-by');

  // First in the chain so every request — including one rejected by CORS or
  // by the body parser — carries a correlation id in its logs.
  app.use(requestLogger);

  app.use(helmet());
  app.use(cors(buildCorsOptions()));

  app.use(express.json({ limit: env.BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.BODY_LIMIT }));

  mountRouter(app, '/health', healthRouter);

  // forgebase:routes — scaffolded modules mount their routers here

  configure?.(app);

  // Order matters: unmatched route first, then the terminal error handler.
  app.use(notFoundHandler);
  app.use(errorHandler);

  if (isProduction && env.CORS_ORIGINS.length === 0) {
    logger.warn('CORS_ORIGINS is empty — all cross-origin browser requests will be rejected.');
  }

  return app;
}
