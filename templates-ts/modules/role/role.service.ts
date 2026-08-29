import type { ListOptions, Page } from '../../core/pagination.js';
import { isUniqueViolation } from '../../db/errors.js';
import type { Repo, TxContext, UnitOfWork } from '../../db/unit-of-work.js';

import { roleNameTaken, roleNotFound, unknownActions } from './role.errors.js';
import type { ActionLookup, RoleRepository } from './role.repository.interface.js';
import type { CreateRoleBody, SetRoleActionsBody, UpdateRoleBody } from './role.schema.js';
import type { GrantedAction, Role } from './role.types.js';

/**
 * Role administration, including which actions each role grants.
 */

export interface RoleServiceDeps {
  roles: Repo<RoleRepository>;
  /** Only used to reject unknown action ids — see `ActionLookup`. */
  actions: Repo<ActionLookup>;
  uow: UnitOfWork;
}

export function createRoleService({ roles, actions, uow }: RoleServiceDeps) {
  async function assertActionsExist(actionIds: string[], tx?: TxContext): Promise<void> {
    if (actionIds.length === 0) return;

    const existing = new Set(await actions(tx).findExistingIds(actionIds));
    const missing = actionIds.filter((id) => !existing.has(id));

    if (missing.length > 0) throw unknownActions(missing);
  }

  async function list(options: ListOptions): Promise<Page<Role>> {
    return roles().list(options);
  }

  async function getById(id: string): Promise<Role> {
    const role = await roles().findById(id);
    if (!role) throw roleNotFound(id);
    return role;
  }

  async function create(body: CreateRoleBody): Promise<Role> {
    try {
      return await roles().create({ name: body.name, description: body.description ?? null });
    } catch (error) {
      if (isUniqueViolation(error)) throw roleNameTaken();
      throw error;
    }
  }

  async function update(id: string, body: UpdateRoleBody): Promise<Role> {
    try {
      const updated = await roles().update(id, body);
      if (!updated) throw roleNotFound(id);
      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) throw roleNameTaken();
      throw error;
    }
  }

  async function remove(id: string): Promise<void> {
    const deleted = await roles().delete(id);
    if (!deleted) throw roleNotFound(id);
  }

  async function getActions(id: string): Promise<GrantedAction[]> {
    await getById(id);
    return roles().findActions(id);
  }

  async function setActions(id: string, body: SetRoleActionsBody): Promise<GrantedAction[]> {
    // Validating the ids and replacing the grants must be atomic, or a
    // concurrent delete could slip between the check and the write.
    await uow.run(async (tx) => {
      const role = await roles(tx).findById(id);
      if (!role) throw roleNotFound(id);

      await assertActionsExist(body.actionIds, tx);
      await roles(tx).setActions(id, body.actionIds);
    });

    return roles().findActions(id);
  }

  return { list, getById, create, update, remove, getActions, setActions };
}

export type RoleService = ReturnType<typeof createRoleService>;
