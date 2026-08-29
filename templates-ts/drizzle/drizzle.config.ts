import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit configuration.
 *
 * `npm run db:generate` diffs `schema.ts` against the recorded migrations and
 * writes SQL into `migrations/`. Generated SQL is committed and reviewed —
 * `push` is deliberately not part of any script, so no environment is ever
 * migrated by an implicit diff.
 *
 * This file is loaded by the drizzle-kit CLI, not by the application, so it
 * reads the environment directly rather than importing the app's env module.
 * That keeps a schema tool from pulling the whole runtime graph in with it.
 */

// A call, not a side-effect import: an import-sorting fix must not be able to
// move environment loading below something that reads it. `quiet` suppresses
// dotenv's banner, which has no place in a build tool's output.
loadDotenv({ quiet: true });

/**
 * Empty is tolerated on purpose.
 *
 * `generate` only diffs the schema against the committed snapshots and never
 * opens a connection, so requiring a database to write a migration file would
 * be a pointless obstacle. `migrate` and `studio` do connect, and fail with
 * drizzle-kit's own message when this is unset.
 */
const url = process.env.DATABASE_URL ?? '';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url,
    ssl: process.env.DB_SSL === 'true',
  },
  strict: true,
  verbose: true,
});
