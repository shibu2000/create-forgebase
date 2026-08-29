import { z } from 'zod';

/**
 * Actions are named `resource:verb` — the convention `authorize()` checks
 * against. Enforcing it here keeps permission names consistent as a project
 * grows rather than drifting into ad-hoc strings.
 */
export const actionName = z
  .string()
  .trim()
  .regex(
    /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/,
    'Must look like "resource:verb", e.g. "user:create"',
  );

const description = z.string().trim().max(500).nullish();

export const createActionBody = z.object({
  name: actionName,
  description,
});

export const updateActionBody = z
  .object({
    name: actionName.optional(),
    description,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreateActionBody = z.infer<typeof createActionBody>;
export type UpdateActionBody = z.infer<typeof updateActionBody>;
