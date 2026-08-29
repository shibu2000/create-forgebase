import type { ListOptions, Page } from '../../core/pagination.js';

import type {
  CreateUserInput,
  UpdateUserInput,
  User,
  UserWithRoles,
  UserWithSecret,
} from './user.types.js';

/**
 * The user repository contract.
 *
 * This is the seam between business logic and persistence: the Sequelize and
 * Drizzle implementations satisfy it identically, so switching ORMs changes
 * nothing in `user.service.ts` or above.
 */
export interface UserRepository {
  list(options: ListOptions): Promise<Page<User>>;
  findById(id: string): Promise<User | null>;
  findWithRoles(id: string): Promise<UserWithRoles | null>;
  /** Includes the password hash — used by the auth module only. */
  findByEmail(email: string): Promise<UserWithSecret | null>;
  create(input: CreateUserInput): Promise<User>;
  update(id: string, input: UpdateUserInput): Promise<User | null>;
  delete(id: string): Promise<boolean>;

  /** Replaces the user's role assignments wholesale. */
  setRoles(userId: string, roleIds: string[]): Promise<void>;
  /**
   * The union of action names granted by every role the user holds — what
   * `authorize()` checks a request against.
   */
  findEffectiveActionNames(userId: string): Promise<string[]>;
}

/**
 * The slice of the role module this one needs, declared here rather than
 * imported.
 *
 * Assigning roles has to reject unknown ids, which means asking the role
 * store what exists — but that is the *only* thing this module wants from it.
 * Declaring the narrow interface on the consuming side keeps `user` free of
 * any dependency on `role`; the role repository satisfies this structurally,
 * at no runtime cost.
 */
export interface RoleLookup {
  findExistingIds(ids: string[]): Promise<string[]>;
}
