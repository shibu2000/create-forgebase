import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createLogger } from '../core/logger.js';

import { closeDatabase, db } from './connection.js';

/**
 * Applies pending migrations, then exits. Run by `npm run db:migrate`, by the
 * test harness against its throwaway container, and as a release step before
 * new application containers start serving.
 */
const log = createLogger('migrate');

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

export async function runMigrations(): Promise<void> {
  log.info({ migrationsFolder }, 'Applying migrations');
  await migrate(db, { migrationsFolder });
  log.info('Migrations up to date');
}

// Only self-execute when invoked directly, so the test harness can import
// `runMigrations` without the process exiting underneath it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await runMigrations();
    await closeDatabase();
    process.exit(0);
  } catch (error) {
    log.fatal({ err: error }, 'Migration failed');
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  }
}
