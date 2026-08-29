import { AppError } from '../../core/errors/AppError.js';
import type { ListOptions, Page } from '../../core/pagination.js';
import { isUniqueViolation } from '../../db/errors.js';
import type { Repo, UnitOfWork } from '../../db/unit-of-work.js';

import { itemCodeTaken, itemNotFound, typeCodeTaken, typeNotFound } from './master-data.errors.js';
import type {
  MasterDataItemRepository,
  MasterDataTypeRepository,
} from './master-data.repository.interface.js';
import type {
  CreateItemBody,
  CreateTypeBody,
  ItemListQuery,
  UpdateItemBody,
  UpdateTypeBody,
} from './master-data.schema.js';
import type { MasterDataItem, MasterDataType } from './master-data.types.js';

/**
 * Reference data: one CRUD implementation serving every kind of lookup list a
 * project needs.
 */

export interface MasterDataServiceDeps {
  types: Repo<MasterDataTypeRepository>;
  items: Repo<MasterDataItemRepository>;
  uow: UnitOfWork;
}

export function createMasterDataService({ types, items, uow }: MasterDataServiceDeps) {
  /** Every item route is scoped by type code, so this runs first each time. */
  async function requireType(code: string): Promise<MasterDataType> {
    const type = await types().findByCode(code);
    if (!type) throw typeNotFound(code);
    return type;
  }

  // ------------------------------------------------------------- types

  async function listTypes(options: ListOptions): Promise<Page<MasterDataType>> {
    return types().list(options);
  }

  async function getType(code: string): Promise<MasterDataType> {
    return requireType(code);
  }

  async function createType(body: CreateTypeBody): Promise<MasterDataType> {
    try {
      return await types().create({
        code: body.code,
        name: body.name,
        description: body.description ?? null,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw typeCodeTaken();
      throw error;
    }
  }

  async function updateType(code: string, body: UpdateTypeBody): Promise<MasterDataType> {
    const type = await requireType(code);

    const updated = await types().update(type.id, body);
    if (!updated) throw typeNotFound(code);
    return updated;
  }

  /**
   * Refuses to delete a type that still holds items.
   *
   * The database would cascade happily, but silently discarding a hundred
   * cities because someone removed the "CITY" type is not a recoverable
   * mistake. Emptying it first has to be deliberate.
   */
  async function deleteType(code: string): Promise<void> {
    await uow.run(async (tx) => {
      const type = await types(tx).findByCode(code);
      if (!type) throw typeNotFound(code);

      const itemCount = await items(tx).countByType(type.id);
      if (itemCount > 0) {
        throw new AppError(
          409,
          'MASTER_DATA_TYPE_IN_USE',
          `Type "${code}" still has ${itemCount} item(s); delete them first`,
          { itemCount },
        );
      }

      await types(tx).delete(type.id);
    });
  }

  // ------------------------------------------------------------- items

  async function listItems(typeCode: string, query: ItemListQuery): Promise<Page<MasterDataItem>> {
    const type = await requireType(typeCode);
    return items().listByType(type.id, query);
  }

  async function getItem(typeCode: string, itemCode: string): Promise<MasterDataItem> {
    const type = await requireType(typeCode);

    const item = await items().findByCode(type.id, itemCode);
    if (!item) throw itemNotFound(typeCode, itemCode);
    return item;
  }

  async function createItem(typeCode: string, body: CreateItemBody): Promise<MasterDataItem> {
    const type = await requireType(typeCode);

    try {
      return await items().create({
        typeId: type.id,
        code: body.code,
        label: body.label,
        meta: body.meta ?? null,
        sortOrder: body.sortOrder,
        isActive: body.isActive,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw itemCodeTaken();
      throw error;
    }
  }

  async function updateItem(
    typeCode: string,
    itemCode: string,
    body: UpdateItemBody,
  ): Promise<MasterDataItem> {
    const existing = await getItem(typeCode, itemCode);

    const updated = await items().update(existing.id, {
      label: body.label,
      meta: body.meta,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
    });

    if (!updated) throw itemNotFound(typeCode, itemCode);
    return updated;
  }

  async function deleteItem(typeCode: string, itemCode: string): Promise<void> {
    const existing = await getItem(typeCode, itemCode);
    await items().delete(existing.id);
  }

  return {
    listTypes,
    getType,
    createType,
    updateType,
    deleteType,
    listItems,
    getItem,
    createItem,
    updateItem,
    deleteItem,
  };
}

export type MasterDataService = ReturnType<typeof createMasterDataService>;
