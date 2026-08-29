/**
 * Domain types for the action module.
 *
 * Actions are the stable permission vocabulary of the system —
 * `user:create`, `master:delete`. Roles come and go; these are what code
 * checks against.
 */

export interface Action {
  id: string;
  name: string;
  description: string | null;
}

export interface CreateActionInput {
  name: string;
  description?: string | null;
}

export type UpdateActionInput = Partial<CreateActionInput>;
