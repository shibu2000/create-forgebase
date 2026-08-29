import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** Reference-data tables: a type, and the items belonging to it. */

export const masterDataTypes = pgTable('master_data_types', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  code: varchar('code', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 150 }).notNull(),
  description: varchar('description', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const masterDataItems = pgTable(
  'master_data_items',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    typeId: uuid('type_id')
      .notNull()
      .references(() => masterDataTypes.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    code: varchar('code', { length: 64 }).notNull(),
    label: varchar('label', { length: 255 }).notNull(),
    // jsonb, not json: it is queryable and indexable, and normalises on write.
    meta: jsonb('meta').$type<Record<string, unknown>>(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Codes are unique within their type, not globally — "ACTIVE" can exist
    // under both STATUS and VISIBILITY.
    unique('master_data_items_type_id_code_key').on(table.typeId, table.code),
    index('master_data_items_type_id_idx').on(table.typeId),
  ],
);
