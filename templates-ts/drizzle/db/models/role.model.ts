import { sql } from 'drizzle-orm';
import { index, pgTable, primaryKey, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { actions } from './action.model.js';

/**
 * Tables owned by the role module: the role itself, and the `role_actions`
 * join table recording which actions it grants.
 */

export const roles = pgTable('roles', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: varchar('description', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const roleActions = pgTable(
  'role_actions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    actionId: uuid('action_id')
      .notNull()
      .references(() => actions.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.actionId] }),
    // Walked by the permission-resolution join.
    index('role_actions_action_id_idx').on(table.actionId),
  ],
);
