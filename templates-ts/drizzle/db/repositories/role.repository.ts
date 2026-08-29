import { asc, count, eq, ilike, inArray } from 'drizzle-orm';

import type { ListOptions, Page } from '../../core/pagination.js';
import type { RoleRepository } from '../../modules/role/role.repository.interface.js';
import type {
  CreateRoleInput,
  GrantedAction,
  Role,
  UpdateRoleInput,
} from '../../modules/role/role.types.js';
import { toClient } from '../connection.js';
import { translateWriteErrors } from '../errors.js';
import { actions } from '../models/action.model.js';
import { roleActions, roles } from '../models/role.model.js';
import type { Repo } from '../unit-of-work.js';

/** Drizzle implementation of `RoleRepository`. */

type RoleRow = typeof roles.$inferSelect;

const toRole = (row: RoleRow): Role => ({
  id: row.id,
  name: row.name,
  description: row.description ?? null,
});

export const roleRepository: Repo<RoleRepository> = (tx) => {
  const client = toClient(tx);

  return {
    async list(options: ListOptions): Promise<Page<Role>> {
      const where = options.search ? ilike(roles.name, `%${options.search}%`) : undefined;

      const rows = await client
        .select()
        .from(roles)
        .where(where)
        .orderBy(asc(roles.name))
        .limit(options.pageSize)
        .offset((options.page - 1) * options.pageSize);

      const [total] = await client.select({ value: count() }).from(roles).where(where);

      return { rows: rows.map(toRole), total: total?.value ?? 0 };
    },

    async findById(id: string): Promise<Role | null> {
      const [row] = await client.select().from(roles).where(eq(roles.id, id)).limit(1);
      return row ? toRole(row) : null;
    },

    async findByName(name: string): Promise<Role | null> {
      const [row] = await client.select().from(roles).where(eq(roles.name, name)).limit(1);
      return row ? toRole(row) : null;
    },

    async findExistingIds(ids: string[]): Promise<string[]> {
      if (ids.length === 0) return [];

      const rows = await client.select({ id: roles.id }).from(roles).where(inArray(roles.id, ids));

      return rows.map((row) => row.id);
    },

    async create(input: CreateRoleInput): Promise<Role> {
      const [row] = await translateWriteErrors(() =>
        client
          .insert(roles)
          .values({ name: input.name, description: input.description ?? null })
          .returning(),
      );

      return toRole(row!);
    },

    async update(id: string, input: UpdateRoleInput): Promise<Role | null> {
      const patch: Partial<typeof roles.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description ?? null;

      const [row] = await translateWriteErrors(() =>
        client.update(roles).set(patch).where(eq(roles.id, id)).returning(),
      );

      return row ? toRole(row) : null;
    },

    async delete(id: string): Promise<boolean> {
      const deleted = await client
        .delete(roles)
        .where(eq(roles.id, id))
        .returning({ id: roles.id });
      return deleted.length > 0;
    },

    async findActions(roleId: string): Promise<GrantedAction[]> {
      return client
        .select({ id: actions.id, name: actions.name, description: actions.description })
        .from(actions)
        .innerJoin(roleActions, eq(roleActions.actionId, actions.id))
        .where(eq(roleActions.roleId, roleId))
        .orderBy(asc(actions.name));
    },

    async setActions(roleId: string, actionIds: string[]): Promise<void> {
      await client.delete(roleActions).where(eq(roleActions.roleId, roleId));

      if (actionIds.length === 0) return;

      await client
        .insert(roleActions)
        .values(actionIds.map((actionId) => ({ roleId, actionId })))
        .onConflictDoNothing();
    },
  };
};
