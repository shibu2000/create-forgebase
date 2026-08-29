import type { Server } from 'node:http';

// forgebase:boot-imports — scaffolded fragments import their registrars here

import { registerReadinessCheck } from './routes/health.js';
import { createApp } from './app.js';
import { env } from './env.js';
import { runBootTasks, runShutdownHooks } from './lifecycle.js';
import { logger } from './logger.js';

/**
 * HTTP server lifecycle: boot, and a graceful drain on SIGTERM/SIGINT.
 *
 * Shutdown order matters. We stop accepting new connections first, let
 * in-flight requests finish, then release resources that fragments registered
 * via `onShutdown`. A hard timer guarantees the process actually exits even
 * if something hangs.
 */

export { onBoot, onShutdown } from './lifecycle.js';

let shuttingDown = false;

// While draining, report not-ready so a load balancer stops sending traffic
// before the socket actually closes.
registerReadinessCheck('server', () => {
  if (shuttingDown) throw new Error('server is shutting down');
});

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    // Keep-alive sockets sitting idle would otherwise hold `close` open.
    server.closeIdleConnections();
  });
}

export function attachShutdownHandlers(server: Server): void {
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutdown signal received, draining connections');

    const forceExit = setTimeout(() => {
      logger.fatal(
        { timeoutMs: env.SHUTDOWN_TIMEOUT_MS },
        'Graceful shutdown timed out, forcing exit',
      );
      server.closeAllConnections();
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);

    // Do not let the timer itself keep the event loop alive.
    forceExit.unref();

    void (async () => {
      try {
        await closeServer(server);
        await runShutdownHooks();
        clearTimeout(forceExit);
        logger.info('Shutdown complete');
        // pino-pretty runs in a worker thread during development; flush so
        // the final lines are not lost to process.exit.
        logger.flush();
        process.exit(0);
      } catch (error) {
        logger.error({ err: error }, 'Error during shutdown');
        process.exit(1);
      }
    })();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error) => {
    // Process state is no longer trustworthy — log and drain immediately.
    logger.fatal({ err: error }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
}

export async function startServer(): Promise<Server> {
  // Dependencies come up before the first request can arrive; a failure here
  // stops the boot rather than surfacing as 500s later.
  await runBootTasks();

  const app = createApp();

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(
      { host: env.HOST, port: env.PORT, env: env.NODE_ENV },
      `Server listening on http://${env.HOST}:${env.PORT}`,
    );
  });

  server.on('error', (error) => {
    logger.fatal({ err: error }, 'Server failed to start');
    process.exit(1);
  });

  attachShutdownHandlers(server);
  return server;
}

// forgebase:boot-registrations — scaffolded fragments register lifecycle hooks here

startServer().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start server');
  logger.flush();
  process.exit(1);
});
