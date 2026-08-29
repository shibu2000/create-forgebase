import { z } from 'zod';

import { booleanish, defineEnv } from '../core/env.js';

/**
 * Database configuration, shared by both ORM variants — the connection
 * string, pool sizing and TLS are properties of the deployment, not of the
 * ORM, so switching between Sequelize and Drizzle changes nothing here.
 */
export const dbConfig = defineEnv(
  z.object({
    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL is required')
      .refine(
        (value) => /^postgres(ql)?:\/\//.test(value),
        'DATABASE_URL must be a postgres:// or postgresql:// connection string',
      ),

    /** Pool sizing. Keep max at or below your Postgres `max_connections`. */
    DB_POOL_MIN: z.coerce.number().int().min(0).default(0),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),

    /** Milliseconds to wait for a free connection before giving up. */
    DB_POOL_ACQUIRE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    /** Milliseconds an idle connection is kept before being released. */
    DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

    /** Enable TLS. Required by most managed Postgres providers. */
    DB_SSL: booleanish(false),

    /** Log every SQL statement. Noisy — intended for local debugging. */
    DB_LOGGING: booleanish(false),

    /** Connection attempts at boot, to ride out a database still starting up. */
    DB_CONNECT_RETRIES: z.coerce.number().int().min(1).default(5),
    DB_CONNECT_RETRY_DELAY_MS: z.coerce.number().int().positive().default(1_000),
  }),
);

export type DbConfig = typeof dbConfig;

/**
 * Managed providers (Neon, Supabase, RDS) terminate TLS with certificates
 * that are not in Node's default trust store. Verification is left off here
 * for that reason; point this at a CA bundle if you need full verification.
 */
export const sslConfig = dbConfig.DB_SSL ? { rejectUnauthorized: false } : false;
