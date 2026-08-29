import { z } from 'zod';

/**
 * Request validation for the user module. Every route runs one of these
 * through `validate()` before the controller, so controllers and services can
 * treat their input as already well-formed.
 */

const email = z.email('Must be a valid email address').trim().toLowerCase().max(255);

/** Long enough to matter, capped so hashing cost stays bounded. */
const password = z.string().min(12, 'Must be at least 12 characters').max(200);

export const createUserBody = z.object({
  email,
  password,
  isActive: z.boolean().default(true),
  /** Optional initial role assignment, applied in the same transaction. */
  roleIds: z.array(z.uuid()).max(50).optional(),
});

export const updateUserBody = z
  .object({
    email: email.optional(),
    password: password.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const setUserRolesBody = z.object({
  roleIds: z.array(z.uuid()).max(50),
});

export type CreateUserBody = z.infer<typeof createUserBody>;
export type UpdateUserBody = z.infer<typeof updateUserBody>;
export type SetUserRolesBody = z.infer<typeof setUserRolesBody>;
