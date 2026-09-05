import type { ListOptions, Page } from '../../core/pagination.js';
import { isUniqueViolation } from '../../db/errors.js';
import type { Repo, TxContext, UnitOfWork } from '../../db/unit-of-work.js';
import type { PasswordHasher } from '../../services/password/password.service.js';

import { emailTaken, unknownRoles, userNotFound } from './user.errors.js';
import type { RoleLookup, UserRepository } from './user.repository.interface.js';
import type { CreateUserBody, SetUserRolesBody, UpdateUserBody } from './user.schema.js';
import type { User, UserWithRoles } from './user.types.js';

/**
 * User administration — the logic behind every `/users` endpoint.
 *
 * This is the only file that decides anything for this module. `user.route`
 * above only unpacks the request and picks a status code; the repositories
 * below only talk to the database. Nothing in this file may import an ORM.
 */

export interface UserControllerDeps {
  users: Repo<UserRepository>;
  /** Only used to reject unknown role ids — see `RoleLookup`. */
  roles: Repo<RoleLookup>;
  uow: UnitOfWork;
  hasher: PasswordHasher;
}

export function createUserController({ users, roles, uow, hasher }: UserControllerDeps) {
  /**
   * Fails with a 422 naming exactly which ids were unknown, rather than
   * letting a foreign key violation surface as a 500.
   */
  async function assertRolesExist(roleIds: string[], tx?: TxContext): Promise<void> {
    if (roleIds.length === 0) return;

    const existing = new Set(await roles(tx).findExistingIds(roleIds));
    const missing = roleIds.filter((id) => !existing.has(id));

    if (missing.length > 0) throw unknownRoles(missing);
  }

  async function list(options: ListOptions): Promise<Page<User>> {
    return users().list(options);
  }

  async function getById(id: string): Promise<UserWithRoles> {
    const user = await users().findWithRoles(id);
    if (!user) throw userNotFound(id);
    return user;
  }

  async function create(body: CreateUserBody): Promise<UserWithRoles> {
    const passwordHash = await hasher.hash(body.password);
    const roleIds = body.roleIds ?? [];

    // Creating the user and assigning their roles is one atomic step — a
    // user that exists without the roles they were meant to have is not a
    // state worth persisting.
    const created = await uow.run(async (tx) => {
      await assertRolesExist(roleIds, tx);

      let user: User;
      try {
        user = await users(tx).create({
          email: body.email,
          passwordHash,
          isActive: body.isActive,
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw emailTaken();
        throw error;
      }

      if (roleIds.length > 0) await users(tx).setRoles(user.id, roleIds);
      return user;
    });

    return getById(created.id);
  }

  async function update(id: string, body: UpdateUserBody): Promise<User> {
    const passwordHash = body.password ? await hasher.hash(body.password) : undefined;

    try {
      const updated = await users().update(id, {
        email: body.email,
        isActive: body.isActive,
        passwordHash,
      });

      if (!updated) throw userNotFound(id);
      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) throw emailTaken();
      throw error;
    }
  }

  async function remove(id: string): Promise<void> {
    const deleted = await users().delete(id);
    if (!deleted) throw userNotFound(id);
  }

  async function setRoles(id: string, body: SetUserRolesBody): Promise<UserWithRoles> {
    await uow.run(async (tx) => {
      const user = await users(tx).findById(id);
      if (!user) throw userNotFound(id);

      await assertRolesExist(body.roleIds, tx);
      await users(tx).setRoles(id, body.roleIds);
    });

    return getById(id);
  }

  /**
   * The union of action names across every role the user holds — the same
   * list `authorize()` checks a request against.
   */
  async function getEffectiveActions(id: string): Promise<string[]> {
    const user = await users().findById(id);
    if (!user) throw userNotFound(id);

    return users().findEffectiveActionNames(id);
  }

  return { list, getById, create, update, remove, setRoles, getEffectiveActions };
}

export type UserController = ReturnType<typeof createUserController>;
