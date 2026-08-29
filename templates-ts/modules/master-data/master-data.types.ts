/**
 * Domain types for reference data.
 *
 * The point of this module is that adding a new *kind* of reference data
 * costs nothing: inserting a `MasterDataType` row called "TOUR_TYPE" gives
 * you a working CRUD surface at `/master-data/types/TOUR_TYPE/items` with no
 * migration, no new table and no new endpoint.
 */

export interface MasterDataType {
  id: string;
  /** Stable machine key, e.g. "CITY" or "TOUR_TYPE". */
  code: string;
  name: string;
  description: string | null;
}

export interface MasterDataItem {
  id: string;
  typeId: string;
  /** Unique within its type, not globally. */
  code: string;
  label: string;
  /** Free-form extras — a currency's symbol, a city's coordinates. */
  meta: Record<string, unknown> | null;
  sortOrder: number;
  isActive: boolean;
}

export interface CreateTypeInput {
  code: string;
  name: string;
  description?: string | null;
}

export type UpdateTypeInput = Partial<Omit<CreateTypeInput, 'code'>>;

export interface CreateItemInput {
  typeId: string;
  code: string;
  label: string;
  meta?: Record<string, unknown> | null;
  sortOrder?: number;
  isActive?: boolean;
}

export type UpdateItemInput = Partial<Omit<CreateItemInput, 'typeId' | 'code'>>;

/** Item listings support an extra filter beyond the shared one. */
export interface ItemListOptions {
  page: number;
  pageSize: number;
  search?: string;
  /** Omit inactive entries — what a form population endpoint wants. */
  activeOnly?: boolean;
}
