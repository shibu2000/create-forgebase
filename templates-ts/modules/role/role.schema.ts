import { z } from 'zod';

const description = z.string().trim().max(500).nullish();

export const createRoleBody = z.object({
  name: z.string().trim().min(1).max(100),
  description,
});

export const updateRoleBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const setRoleActionsBody = z.object({
  actionIds: z.array(z.uuid()).max(200),
});

export type CreateRoleBody = z.infer<typeof createRoleBody>;
export type UpdateRoleBody = z.infer<typeof updateRoleBody>;
export type SetRoleActionsBody = z.infer<typeof setRoleActionsBody>;
