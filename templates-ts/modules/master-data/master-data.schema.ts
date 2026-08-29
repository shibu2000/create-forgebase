import { z } from 'zod';

/**
 * Codes are the stable identifiers callers hardcode, so they are constrained
 * to a shouty-snake shape — "TOUR_TYPE", not "Tour Type" or "tour-type".
 * Enforcing it here stops a project accumulating three spellings of the same
 * concept.
 */
const code = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Must be upper snake case, e.g. "TOUR_TYPE"');

const description = z.string().trim().max(500).nullish();

/** Arbitrary JSON, but an object — so it can be extended without a shape change. */
const meta = z.record(z.string(), z.unknown()).nullish();

export const typeCodeParam = z.object({ code });
export const itemCodeParams = z.object({ code, itemCode: code });

export const itemListQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
  /** `?activeOnly=true` is what a form-population caller wants. */
  activeOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const createTypeBody = z.object({
  code,
  name: z.string().trim().min(1).max(150),
  description,
});

export const updateTypeBody = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    description,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const createItemBody = z.object({
  code,
  label: z.string().trim().min(1).max(255),
  meta,
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateItemBody = z
  .object({
    label: z.string().trim().min(1).max(255).optional(),
    meta,
    sortOrder: z.coerce.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type ItemListQuery = z.infer<typeof itemListQuery>;
export type CreateTypeBody = z.infer<typeof createTypeBody>;
export type UpdateTypeBody = z.infer<typeof updateTypeBody>;
export type CreateItemBody = z.infer<typeof createItemBody>;
export type UpdateItemBody = z.infer<typeof updateItemBody>;
