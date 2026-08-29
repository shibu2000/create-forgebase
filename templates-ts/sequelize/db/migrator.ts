import { fileURLToPath } from 'node:url';

import type { QueryInterface } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';

import { createLogger } from '../core/logger.js';

import { closeDatabase, sequelize } from './connection.js';

/**
 * Migration runner.
 *
 * Umzug is used rather than `sequelize-cli` because this project is ESM and
 * TypeScript throughout: migrations are plain modules the same toolchain
 * already compiles, with no separate `.sequelizerc` and CommonJS config to
 * keep in sync.
 *
 * Applied migrations are recorded in the `sequelize_meta` table.
 */
const log = createLogger('migrate');

/**
 * One central, timestamp-ordered timeline. Migrations are not kept inside
 * module folders because they routinely span modules — the first one creates
 * `user_roles`, which references both `users` and `roles`. The CLI copies in
 * only the migrations belonging to the modules you selected.
 */
const migrationsPath = fileURLToPath(new URL('./migrations', import.meta.url));

export const migrator = new Umzug({
  // Matches `.ts` under tsx during development and `.js` from dist in production.
  migrations: { glob: ['*.{ts,js}', { cwd: migrationsPath }] },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize, tableName: 'sequelize_meta' }),
  logger: {
    info: (message) => log.info(message),
    warn: (message) => log.warn(message),
    error: (message) => log.error(message),
    debug: (message) => log.debug(message),
  },
});

/** The shape every migration file implements. */
export type Migration = typeof migrator._types.migration;

/** Migration context — `QueryInterface` is Sequelize's schema-change API. */
export type MigrationContext = QueryInterface;

export async function runMigrations(): Promise<void> {
  await migrator.up();
}

// Only self-execute when invoked directly, so the test harness can import
// `runMigrations` without the process exiting underneath it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    // With a subcommand (`up`, `down`, `pending`) behave as a CLI; with none,
    // just apply everything — so `tsx src/db/migrator.ts` means the same
    // thing here as it does in the Drizzle variant.
    if (process.argv[2]) {
      await migrator.runAsCLI();
    } else {
      await runMigrations();
    }

    await closeDatabase();
  } catch (error) {
    log.fatal({ err: error }, 'Migration failed');
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  }
}
