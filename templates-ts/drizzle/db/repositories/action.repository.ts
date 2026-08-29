import { asc, count, eq, ilike, inArray } from 'drizzle-orm';

import type { ListOptions, Page } from '../../core/pagination.js';
import type { ActionRepository } from '../../modules/action/action.repository.interface.js';
import type {
  Action,
  CreateActionInput,
  UpdateActionInput,
} from '../../modules/action/action.types.js';
import { toClient } from '../connection.js';
import { translateWriteErrors } from '../errors.js';
import { actions } from '../models/action.model.js';
import type { Repo } from '../unit-of-work.js';

/** Drizzle implementation of `ActionRepository`. */

type ActionRow = typeof actions.$inferSelect;

const toAction = (row: ActionRow): Action => ({
  id: row.id,
  name: row.name,
  description: row.description ?? null,
});

export const actionRepository: Repo<ActionRepository> = (tx) => {
  const client = toClient(tx);

  return {
    async list(options: ListOptions): Promise<Page<Action>> {
      const where = options.search ? ilike(actions.name, `%${options.search}%`) : undefined;

      const rows = await client
        .select()
        .from(actions)
        .where(where)
        .orderBy(asc(actions.name))
        .limit(options.pageSize)
        .offset((options.page - 1) * options.pageSize);

      const [total] = await client.select({ value: count() }).from(actions).where(where);

      return { rows: rows.map(toAction), total: total?.value ?? 0 };
    },

    async findById(id: string): Promise<Action | null> {
      const [row] = await client.select().from(actions).where(eq(actions.id, id)).limit(1);
      return row ? toAction(row) : null;
    },

    async findByName(name: string): Promise<Action | null> {
      const [row] = await client.select().from(actions).where(eq(actions.name, name)).limit(1);
      return row ? toAction(row) : null;
    },

    async findExistingIds(ids: string[]): Promise<string[]> {
      if (ids.length === 0) return [];

      const rows = await client
        .select({ id: actions.id })
        .from(actions)
        .where(inArray(actions.id, ids));

      return rows.map((row) => row.id);
    },

    async create(input: CreateActionInput): Promise<Action> {
      const [row] = await translateWriteErrors(() =>
        client
          .insert(actions)
          .values({ name: input.name, description: input.description ?? null })
          .returning(),
      );

      return toAction(row!);
    },

    async update(id: string, input: UpdateActionInput): Promise<Action | null> {
      const patch: Partial<typeof actions.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description ?? null;

      const [row] = await translateWriteErrors(() =>
        client.update(actions).set(patch).where(eq(actions.id, id)).returning(),
      );

      return row ? toAction(row) : null;
    },

    async delete(id: string): Promise<boolean> {
      const deleted = await client
        .delete(actions)
        .where(eq(actions.id, id))
        .returning({ id: actions.id });

      return deleted.length > 0;
    },
  };
};
