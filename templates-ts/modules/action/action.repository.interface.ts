import type { ListOptions, Page } from '../../core/pagination.js';

import type { Action, CreateActionInput, UpdateActionInput } from './action.types.js';

/**
 * The action repository contract. The Sequelize and Drizzle implementations
 * satisfy it identically.
 */
export interface ActionRepository {
  list(options: ListOptions): Promise<Page<Action>>;
  findById(id: string): Promise<Action | null>;
  findByName(name: string): Promise<Action | null>;
  /**
   * Which of these ids exist. Consumed by the role module through its own
   * narrow `ActionLookup` interface, so no module has to depend on this one.
   */
  findExistingIds(ids: string[]): Promise<string[]>;
  create(input: CreateActionInput): Promise<Action>;
  update(id: string, input: UpdateActionInput): Promise<Action | null>;
  delete(id: string): Promise<boolean>;
}
