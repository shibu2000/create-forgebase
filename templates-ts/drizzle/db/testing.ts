import { sql } from 'drizzle-orm';

import { db } from './connection.js';

/**
 * Test-only database utilities.
 *
 * Raw SQL, so it lives in the ORM layer with everything else that speaks
 * Postgres directly. Both adapters expose the same function, which is what
 * lets the test helpers above stay ORM-agnostic.
 */

/**
 * Empties the given tables in one statement.
 *
 * `CASCADE` plus a single TRUNCATE sidesteps foreign-key ordering entirely —
 * far simpler and much faster than deleting table by table in dependency
 * order.
 */
export async function truncateAll(tables: string[]): Promise<void> {
  if (tables.length === 0) return;

  const list = tables.map((table) => `"${table}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`));
}
