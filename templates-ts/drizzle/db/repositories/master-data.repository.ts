import { and, asc, count, eq, ilike, or, type SQL } from 'drizzle-orm';

import type { ListOptions, Page } from '../../core/pagination.js';
import type {
  MasterDataItemRepository,
  MasterDataTypeRepository,
} from '../../modules/master-data/master-data.repository.interface.js';
import type {
  CreateItemInput,
  CreateTypeInput,
  ItemListOptions,
  MasterDataItem,
  MasterDataType,
  UpdateItemInput,
  UpdateTypeInput,
} from '../../modules/master-data/master-data.types.js';
import { toClient } from '../connection.js';
import { translateWriteErrors } from '../errors.js';
import { masterDataItems, masterDataTypes } from '../models/master-data.model.js';
import type { Repo } from '../unit-of-work.js';

/** Drizzle implementations of the reference-data repositories. */

type TypeRow = typeof masterDataTypes.$inferSelect;
type ItemRow = typeof masterDataItems.$inferSelect;

const toType = (row: TypeRow): MasterDataType => ({
  id: row.id,
  code: row.code,
  name: row.name,
  description: row.description ?? null,
});

const toItem = (row: ItemRow): MasterDataItem => ({
  id: row.id,
  typeId: row.typeId,
  code: row.code,
  label: row.label,
  meta: row.meta ?? null,
  sortOrder: row.sortOrder,
  isActive: row.isActive,
});

export const masterDataTypeRepository: Repo<MasterDataTypeRepository> = (tx) => {
  const client = toClient(tx);

  return {
    async list(options: ListOptions): Promise<Page<MasterDataType>> {
      const where = options.search
        ? or(
            ilike(masterDataTypes.code, `%${options.search}%`),
            ilike(masterDataTypes.name, `%${options.search}%`),
          )
        : undefined;

      const rows = await client
        .select()
        .from(masterDataTypes)
        .where(where)
        .orderBy(asc(masterDataTypes.code))
        .limit(options.pageSize)
        .offset((options.page - 1) * options.pageSize);

      const [total] = await client.select({ value: count() }).from(masterDataTypes).where(where);

      return { rows: rows.map(toType), total: total?.value ?? 0 };
    },

    async findById(id: string): Promise<MasterDataType | null> {
      const [row] = await client
        .select()
        .from(masterDataTypes)
        .where(eq(masterDataTypes.id, id))
        .limit(1);

      return row ? toType(row) : null;
    },

    async findByCode(code: string): Promise<MasterDataType | null> {
      const [row] = await client
        .select()
        .from(masterDataTypes)
        .where(eq(masterDataTypes.code, code))
        .limit(1);

      return row ? toType(row) : null;
    },

    async create(input: CreateTypeInput): Promise<MasterDataType> {
      const [row] = await translateWriteErrors(() =>
        client
          .insert(masterDataTypes)
          .values({
            code: input.code,
            name: input.name,
            description: input.description ?? null,
          })
          .returning(),
      );

      return toType(row!);
    },

    async update(id: string, input: UpdateTypeInput): Promise<MasterDataType | null> {
      const patch: Partial<typeof masterDataTypes.$inferInsert> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description ?? null;

      const [row] = await translateWriteErrors(() =>
        client.update(masterDataTypes).set(patch).where(eq(masterDataTypes.id, id)).returning(),
      );

      return row ? toType(row) : null;
    },

    async delete(id: string): Promise<boolean> {
      const deleted = await client
        .delete(masterDataTypes)
        .where(eq(masterDataTypes.id, id))
        .returning({ id: masterDataTypes.id });

      return deleted.length > 0;
    },
  };
};

export const masterDataItemRepository: Repo<MasterDataItemRepository> = (tx) => {
  const client = toClient(tx);

  return {
    async listByType(typeId: string, options: ItemListOptions): Promise<Page<MasterDataItem>> {
      const conditions: SQL[] = [eq(masterDataItems.typeId, typeId)];

      if (options.activeOnly) conditions.push(eq(masterDataItems.isActive, true));
      if (options.search) {
        const match = or(
          ilike(masterDataItems.code, `%${options.search}%`),
          ilike(masterDataItems.label, `%${options.search}%`),
        );
        if (match) conditions.push(match);
      }

      const where = and(...conditions);

      const rows = await client
        .select()
        .from(masterDataItems)
        .where(where)
        // sortOrder is the whole reason the column exists: it lets an editor
        // control the order a dropdown renders in.
        .orderBy(asc(masterDataItems.sortOrder), asc(masterDataItems.label))
        .limit(options.pageSize)
        .offset((options.page - 1) * options.pageSize);

      const [total] = await client.select({ value: count() }).from(masterDataItems).where(where);

      return { rows: rows.map(toItem), total: total?.value ?? 0 };
    },

    async findByCode(typeId: string, code: string): Promise<MasterDataItem | null> {
      const [row] = await client
        .select()
        .from(masterDataItems)
        .where(and(eq(masterDataItems.typeId, typeId), eq(masterDataItems.code, code)))
        .limit(1);

      return row ? toItem(row) : null;
    },

    async create(input: CreateItemInput): Promise<MasterDataItem> {
      const [row] = await translateWriteErrors(() =>
        client
          .insert(masterDataItems)
          .values({
            typeId: input.typeId,
            code: input.code,
            label: input.label,
            meta: input.meta ?? null,
            sortOrder: input.sortOrder ?? 0,
            isActive: input.isActive ?? true,
          })
          .returning(),
      );

      return toItem(row!);
    },

    async update(id: string, input: UpdateItemInput): Promise<MasterDataItem | null> {
      const patch: Partial<typeof masterDataItems.$inferInsert> = { updatedAt: new Date() };
      if (input.label !== undefined) patch.label = input.label;
      if (input.meta !== undefined) patch.meta = input.meta ?? null;
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
      if (input.isActive !== undefined) patch.isActive = input.isActive;

      const [row] = await translateWriteErrors(() =>
        client.update(masterDataItems).set(patch).where(eq(masterDataItems.id, id)).returning(),
      );

      return row ? toItem(row) : null;
    },

    async delete(id: string): Promise<boolean> {
      const deleted = await client
        .delete(masterDataItems)
        .where(eq(masterDataItems.id, id))
        .returning({ id: masterDataItems.id });

      return deleted.length > 0;
    },

    async countByType(typeId: string): Promise<number> {
      const [row] = await client
        .select({ value: count() })
        .from(masterDataItems)
        .where(eq(masterDataItems.typeId, typeId));

      return row?.value ?? 0;
    },
  };
};
