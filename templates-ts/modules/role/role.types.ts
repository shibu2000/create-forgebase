/**
 * Domain types for the role module.
 *
 * A role is a named bundle of actions. Roles are the part of the model that
 * changes shape per project, which is exactly why authorization checks the
 * actions a role grants and never the role's name.
 */

export interface Role {
  id: string;
  name: string;
  description: string | null;
}

/** An action as this module needs to report it. */
export interface GrantedAction {
  id: string;
  name: string;
  description: string | null;
}

export interface CreateRoleInput {
  name: string;
  description?: string | null;
}

export type UpdateRoleInput = Partial<CreateRoleInput>;
