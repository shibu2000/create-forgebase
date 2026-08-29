import { Sequelize, type Transaction } from 'sequelize';

import { onBoot, onShutdown } from '../core/lifecycle.js';
import { createLogger } from '../core/logger.js';
import { registerReadinessCheck } from '../core/routes/health.js';

import { dbConfig, sslConfig } from './db.config.js';
import { connectWithRetry } from './retry.js';
import type { TxContext, UnitOfWork } from './unit-of-work.js';

/**
 * The Sequelize connection, and the transaction runner built on it.
 *
 * Everything ORM-aware in this project lives under `src/db`. Modules depend
 * on the interfaces in `src/modules/<name>/<name>.repository.interface.ts`
 * and never import from here — which is what makes the ORM swappable.
 */

const log = createLogger('db');

export const sequelize = new Sequelize(dbConfig.DATABASE_URL, {
  dialect: 'postgres',

  logging: dbConfig.DB_LOGGING ? (sql: string) => log.debug({ sql }, 'query') : false,

  pool: {
    min: dbConfig.DB_POOL_MIN,
    max: dbConfig.DB_POOL_MAX,
    acquire: dbConfig.DB_POOL_ACQUIRE_TIMEOUT_MS,
    idle: dbConfig.DB_POOL_IDLE_TIMEOUT_MS,
  },

  dialectOptions: sslConfig ? { ssl: sslConfig } : {},

  define: {
    // The schema is snake_case; model attributes stay camelCase in TypeScript.
    underscored: true,
    timestamps: true,
  },
});

/**
 * Sequelize's half of the transaction seam.
 *
 * The cast is confined to this file: `TxContext` is opaque to every caller,
 * and this is the only place allowed to know it is really a Sequelize
 * `Transaction`.
 */
export const unitOfWork: UnitOfWork = {
  async run<T>(work: (tx: TxContext) => Promise<T>): Promise<T> {
    return sequelize.transaction((transaction) => work(transaction as unknown as TxContext));
  },
};

/** Unwraps a `TxContext` for use in a Sequelize query. */
export function toTransaction(tx?: TxContext): Transaction | undefined {
  return tx as Transaction | undefined;
}

export async function connectDatabase(): Promise<void> {
  await connectWithRetry(() => sequelize.authenticate(), log);
  log.info(
    { poolMin: dbConfig.DB_POOL_MIN, poolMax: dbConfig.DB_POOL_MAX },
    'Database connection established',
  );
}

/** Cheap liveness probe for `/health/ready`. */
export async function pingDatabase(): Promise<void> {
  await sequelize.query('SELECT 1');
}

export async function closeDatabase(): Promise<void> {
  await sequelize.close();
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
