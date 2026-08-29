import { asc, count, desc, eq, ilike } from 'drizzle-orm';

import type { ListOptions, Page } from '../../core/pagination.js';
import type { UserRepository } from '../../modules/user/user.repository.interface.js';
import type {
  CreateUserInput,
  UpdateUserInput,
  User,
  UserWithRoles,
  UserWithSecret,
} from '../../modules/user/user.types.js';
import { toClient } from '../connection.js';
import { translateWriteErrors } from '../errors.js';
import { actions } from '../models/action.model.js';
import { roleActions, roles } from '../models/role.model.js';
import { userRoles, users } from '../models/user.model.js';
import type { Repo } from '../unit-of-work.js';

/**
 * Drizzle implementation of `UserRepository`.
 *
 * Satisfies exactly the same interface as the Sequelize version, so nothing
 * in `src/modules/user` changes when the ORM does.
 */

type UserRow = typeof users.$inferSelect;

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  isActive: row.isActive,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toUserWithSecret = (row: UserRow): UserWithSecret => ({
  ...toUser(row),
  passwordHash: row.passwordHash,
});

export const userRepository: Repo<UserRepository> = (tx) => {
  const client = toClient(tx);

  return {
    async list(options: ListOptions): Promise<Page<User>> {
      const where = options.search ? ilike(users.email, `%${options.search}%`) : undefined;

      const rows = await client
        .select()
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(options.pageSize)
        .offset((options.page - 1) * options.pageSize);

      const [total] = await client.select({ value: count() }).from(users).where(where);

      return { rows: rows.map(toUser), total: total?.value ?? 0 };
    },

    async findById(id: string): Promise<User | null> {
      const [row] = await client.select().from(users).where(eq(users.id, id)).limit(1);
      return row ? toUser(row) : null;
    },

    async findWithRoles(id: string): Promise<UserWithRoles | null> {
      const [row] = await client.select().from(users).where(eq(users.id, id)).limit(1);
      if (!row) return null;

      const assigned = await client
        .select({ id: roles.id, name: roles.name })
        .from(roles)
        .innerJoin(userRoles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, id))
        .orderBy(asc(roles.name));

      return { ...toUser(row), roles: assigned };
    },

    async findByEmail(email: string): Promise<UserWithSecret | null> {
      const [row] = await client.select().from(users).where(eq(users.email, email)).limit(1);
      return row ? toUserWithSecret(row) : null;
    },

    async create(input: CreateUserInput): Promise<User> {
      const [row] = await translateWriteErrors(() =>
        client
          .insert(users)
          .values({
            email: input.email,
            passwordHash: input.passwordHash,
            isActive: input.isActive ?? true,
          })
          .returning(),
      );

      // `returning()` on a successful single-row insert always yields a row.
      return toUser(row!);
    },

    async update(id: string, input: UpdateUserInput): Promise<User | null> {
      // Only assign what was actually supplied; an absent field must not
      // overwrite a stored value.
      const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
      if (input.email !== undefined) patch.email = input.email;
      if (input.passwordHash !== undefined) patch.passwordHash = input.passwordHash;
      if (input.isActive !== undefined) patch.isActive = input.isActive;

      const [row] = await translateWriteErrors(() =>
        client.update(users).set(patch).where(eq(users.id, id)).returning(),
      );

      return row ? toUser(row) : null;
    },

    async delete(id: string): Promise<boolean> {
      const deleted = await client
        .delete(users)
        .where(eq(users.id, id))
        .returning({ id: users.id });

      return deleted.length > 0;
    },

    async setRoles(userId: string, roleIds: string[]): Promise<void> {
      // Replace wholesale: clear then insert, inside whatever transaction the
      // caller opened, so the user is never briefly role-less to a reader.
      await client.delete(userRoles).where(eq(userRoles.userId, userId));

      if (roleIds.length === 0) return;

      await client
        .insert(userRoles)
        .values(roleIds.map((roleId) => ({ userId, roleId })))
        .onConflictDoNothing();
    },

    async findEffectiveActionNames(userId: string): Promise<string[]> {
      // A three-table set union: every action granted by any role the user
      // holds, deduplicated.
      const rows = await client
        .selectDistinct({ name: actions.name })
        .from(actions)
        .innerJoin(roleActions, eq(roleActions.actionId, actions.id))
        .innerJoin(userRoles, eq(userRoles.roleId, roleActions.roleId))
        .where(eq(userRoles.userId, userId))
        .orderBy(asc(actions.name));

      return rows.map((row) => row.name);
    },
  };
};
