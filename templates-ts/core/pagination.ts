import { z } from 'zod';

/**
 * Shared listing vocabulary.
 *
 * Every module's list endpoint takes the same query shape and returns the
 * same page shape, so pagination behaves identically across the API rather
 * than being reinvented per module.
 */

export interface ListOptions {
  page: number;
  pageSize: number;
  /** Case-insensitive partial match on the entity's natural key. */
  search?: string;
}

export interface Page<T> {
  rows: T[];
  total: number;
}

export const listQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  // Capped so a client cannot ask for the whole table in one request.
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().min(1).max(200).optional(),
});

export type ListQuery = z.infer<typeof listQuery>;

/** Path parameter shared by every `/:id` route. */
export const uuidParam = z.object({ id: z.uuid('Must be a valid UUID') });

/** Translates a page request into SQL offset/limit. */
export function toOffsetLimit({ page, pageSize }: ListOptions): { offset: number; limit: number } {
  return { offset: (page - 1) * pageSize, limit: pageSize };
}
