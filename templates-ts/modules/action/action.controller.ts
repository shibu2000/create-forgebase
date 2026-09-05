import type { ListOptions, Page } from '../../core/pagination.js';
import { isUniqueViolation } from '../../db/errors.js';
import type { Repo } from '../../db/unit-of-work.js';

import { actionNameTaken, actionNotFound } from './action.errors.js';
import type { ActionRepository } from './action.repository.interface.js';
import type { CreateActionBody, UpdateActionBody } from './action.schema.js';
import type { Action } from './action.types.js';

/**
 * Action (permission) administration — the logic behind every `/actions`
 * endpoint.
 *
 * `action.route` above only unpacks the request; the repositories below
 * only talk to the database. Nothing in this file may import an ORM.
 */

export interface ActionControllerDeps {
  actions: Repo<ActionRepository>;
}

export function createActionController({ actions }: ActionControllerDeps) {
  async function list(options: ListOptions): Promise<Page<Action>> {
    return actions().list(options);
  }

  async function getById(id: string): Promise<Action> {
    const action = await actions().findById(id);
    if (!action) throw actionNotFound(id);
    return action;
  }

  async function create(body: CreateActionBody): Promise<Action> {
    try {
      return await actions().create({ name: body.name, description: body.description ?? null });
    } catch (error) {
      if (isUniqueViolation(error)) throw actionNameTaken();
      throw error;
    }
  }

  async function update(id: string, body: UpdateActionBody): Promise<Action> {
    try {
      const updated = await actions().update(id, body);
      if (!updated) throw actionNotFound(id);
      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) throw actionNameTaken();
      throw error;
    }
  }

  async function remove(id: string): Promise<void> {
    const deleted = await actions().delete(id);
    if (!deleted) throw actionNotFound(id);
  }

  return { list, getById, create, update, remove };
}

export type ActionController = ReturnType<typeof createActionController>;
