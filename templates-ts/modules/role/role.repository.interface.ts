import type { ListOptions, Page } from '../../core/pagination.js';

import type { CreateRoleInput, GrantedAction, Role, UpdateRoleInput } from './role.types.js';

/**
 * The role repository contract. The Sequelize and Drizzle implementations
 * satisfy it identically.
 */
export interface RoleRepository {
  list(options: ListOptions): Promise<Page<Role>>;
  findById(id: string): Promise<Role | null>;
  findByName(name: string): Promise<Role | null>;
  /**
   * Which of these ids exist. Consumed by the user module through its own
   * narrow `RoleLookup` interface, so neither module depends on the other.
   */
  findExistingIds(ids: string[]): Promise<string[]>;
  create(input: CreateRoleInput): Promise<Role>;
  update(id: string, input: UpdateRoleInput): Promise<Role | null>;
  delete(id: string): Promise<boolean>;

  findActions(roleId: string): Promise<GrantedAction[]>;
  /** Replaces the role's action grants wholesale. */
  setActions(roleId: string, actionIds: string[]): Promise<void>;
}

/**
 * The slice of the action module this one needs, declared here rather than
 * imported — granting actions must reject unknown ids, and that is the only
 * thing this module wants from the action store.
 */
export interface ActionLookup {
  findExistingIds(ids: string[]): Promise<string[]>;
}
