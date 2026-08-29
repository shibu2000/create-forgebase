import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { onBoot, onShutdown } from '../core/lifecycle.js';
import { createLogger } from '../core/logger.js';
import { registerReadinessCheck } from '../core/routes/health.js';

import { dbConfig, sslConfig } from './db.config.js';
import { connectWithRetry } from './retry.js';
import * as schema from './schema.js';
import type { TxContext, UnitOfWork } from './unit-of-work.js';

/**
 * The Drizzle connection, and the transaction runner built on it.
 *
 * Everything ORM-aware in this project lives under `src/db`. Modules depend
 * on the interfaces in `src/modules/<name>/<name>.repository.interface.ts`
 * and never import from here — which is what makes the ORM swappable.
 */

const log = createLogger('db');

// `pg` ships as CommonJS, so it is imported as a default and dereferenced
// rather than destructured for named exports.
export const pool = new pg.Pool({
  connectionString: dbConfig.DATABASE_URL,
  min: dbConfig.DB_POOL_MIN,
  max: dbConfig.DB_POOL_MAX,
  connectionTimeoutMillis: dbConfig.DB_POOL_ACQUIRE_TIMEOUT_MS,
  idleTimeoutMillis: dbConfig.DB_POOL_IDLE_TIMEOUT_MS,
  ssl: sslConfig,
});

// An idle client erroring out must not take the process down.
pool.on('error', (error) => {
  log.error({ err: error }, 'Idle database client error');
});

export const db: NodePgDatabase<typeof schema> = drizzle(pool, {
  schema,
  logger: dbConfig.DB_LOGGING
    ? { logQuery: (query, params) => log.debug({ sql: query, params }, 'query') }
    : false,
});

/**
 * A transaction handle, derived from `db.transaction` rather than named
 * directly — Drizzle's transaction type is deeply generic, and deriving it
 * keeps this correct across versions.
 */
type DrizzleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Either the pool-backed instance or an open transaction. */
export type DbClient = typeof db | DrizzleTransaction;

/**
 * Drizzle's half of the transaction seam.
 *
 * The cast is confined to this file: `TxContext` is opaque to every caller,
 * and this is the only place allowed to know what it really is.
 */
export const unitOfWork: UnitOfWork = {
  async run<T>(work: (tx: TxContext) => Promise<T>): Promise<T> {
    return db.transaction((tx) => work(tx as unknown as TxContext));
  },
};

/**
 * Resolves a `TxContext` to the client a query should run on: the open
 * transaction when there is one, the pool otherwise.
 */
export function toClient(tx?: TxContext): DbClient {
  return (tx as DbClient | undefined) ?? db;
}

export async function connectDatabase(): Promise<void> {
  await connectWithRetry(async () => {
    const client = await pool.connect();
    client.release();
  }, log);

  log.info(
    { poolMin: dbConfig.DB_POOL_MIN, poolMax: dbConfig.DB_POOL_MAX },
    'Database connection established',
  );
}

/** Cheap liveness probe for `/health/ready`. */
export async function pingDatabase(): Promise<void> {
  await pool.query('SELECT 1');
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

/**
 * Wires the connection into the application lifecycle. Called from
 * `server.ts`; keeping it explicit means importing this module has no side
 * effects, which matters for tests.
 */
export function registerDatabase(): void {
  onBoot('database', connectDatabase);
  onShutdown('database', closeDatabase);
  registerReadinessCheck('database', pingDatabase);
}
