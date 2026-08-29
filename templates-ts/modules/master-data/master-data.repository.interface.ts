import type { ListOptions, Page } from '../../core/pagination.js';

import type {
  CreateItemInput,
  CreateTypeInput,
  ItemListOptions,
  MasterDataItem,
  MasterDataType,
  UpdateItemInput,
  UpdateTypeInput,
} from './master-data.types.js';

/**
 * Repository contracts for reference data. The Sequelize and Drizzle
 * implementations satisfy these identically.
 */

export interface MasterDataTypeRepository {
  list(options: ListOptions): Promise<Page<MasterDataType>>;
  findById(id: string): Promise<MasterDataType | null>;
  /** Types are addressed by code throughout the API, not by id. */
  findByCode(code: string): Promise<MasterDataType | null>;
  create(input: CreateTypeInput): Promise<MasterDataType>;
  update(id: string, input: UpdateTypeInput): Promise<MasterDataType | null>;
  delete(id: string): Promise<boolean>;
}

export interface MasterDataItemRepository {
  listByType(typeId: string, options: ItemListOptions): Promise<Page<MasterDataItem>>;
  findByCode(typeId: string, code: string): Promise<MasterDataItem | null>;
  create(input: CreateItemInput): Promise<MasterDataItem>;
  update(id: string, input: UpdateItemInput): Promise<MasterDataItem | null>;
  delete(id: string): Promise<boolean>;
  /** How many items a type holds — used to refuse deleting a type in use. */
  countByType(typeId: string): Promise<number>;
}
