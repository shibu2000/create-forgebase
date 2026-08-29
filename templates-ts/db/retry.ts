import type { Logger } from 'pino';

import { dbConfig } from './db.config.js';

/**
 * Retries the initial connection with linear backoff.
 *
 * A database and an application started together — docker compose, a fresh
 * CI job, a rolling deploy — routinely race, and the app usually loses. One
 * refused connection at boot should not take the process down when the
 * database is seconds away from accepting traffic.
 */
export async function connectWithRetry(
  connect: () => Promise<void>,
  log: Logger,
  retries: number = dbConfig.DB_CONNECT_RETRIES,
  delayMs: number = dbConfig.DB_CONNECT_RETRY_DELAY_MS,
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await connect();
      return;
    } catch (error) {
      lastError = error;

      if (attempt === retries) break;

      const wait = delayMs * attempt;
      log.warn(
        { attempt, retries, retryInMs: wait, err: error },
        'Database connection failed, retrying',
      );
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  throw lastError;
}
