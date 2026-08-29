import { type InferAttributes, Op, type WhereOptions } from 'sequelize';

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
import { toTransaction } from '../connection.js';
import { translateWriteErrors } from '../errors.js';
import { MasterDataItemModel, MasterDataTypeModel } from '../models/master-data.model.js';
import type { Repo } from '../unit-of-work.js';

/** Sequelize implementations of the reference-data repositories. */

const toType = (model: MasterDataTypeModel): MasterDataType => ({
  id: model.id,
  code: model.code,
  name: model.name,
  description: model.description ?? null,
});

const toItem = (model: MasterDataItemModel): MasterDataItem => ({
  id: model.id,
  typeId: model.typeId,
  code: model.code,
  label: model.label,
  meta: model.meta ?? null,
  sortOrder: model.sortOrder,
  isActive: model.isActive,
});

export const masterDataTypeRepository: Repo<MasterDataTypeRepository> = (txContext) => {
  const transaction = toTransaction(txContext);

  return {
    async list(options: ListOptions): Promise<Page<MasterDataType>> {
      const { rows, count } = await MasterDataTypeModel.findAndCountAll({
        where: options.search
          ? {
              [Op.or]: [
                { code: { [Op.iLike]: `%${options.search}%` } },
                { name: { [Op.iLike]: `%${options.search}%` } },
              ],
            }
          : {},
        order: [['code', 'ASC']],
        limit: options.pageSize,
        offset: (options.page - 1) * options.pageSize,
        transaction,
      });

      return { rows: rows.map(toType), total: count };
    },

    async findById(id: string): Promise<MasterDataType | null> {
      const model = await MasterDataTypeModel.findByPk(id, { transaction });
      return model ? toType(model) : null;
    },

    async findByCode(code: string): Promise<MasterDataType | null> {
      const model = await MasterDataTypeModel.findOne({ where: { code }, transaction });
      return model ? toType(model) : null;
    },

    async create(input: CreateTypeInput): Promise<MasterDataType> {
      const model = await translateWriteErrors(() =>
        MasterDataTypeModel.create(
          { code: input.code, name: input.name, description: input.description ?? null },
          { transaction },
        ),
      );

      return toType(model);
    },

    async update(id: string, input: UpdateTypeInput): Promise<MasterDataType | null> {
      const model = await MasterDataTypeModel.findByPk(id, { transaction });
      if (!model) return null;

      if (input.name !== undefined) model.name = input.name;
      if (input.description !== undefined) model.description = input.description ?? null;

      await translateWriteErrors(() => model.save({ transaction }));
      return toType(model);
    },

    async delete(id: string): Promise<boolean> {
      const deleted = await MasterDataTypeModel.destroy({ where: { id }, transaction });
      return deleted > 0;
    },
  };
};

export const masterDataItemRepository: Repo<MasterDataItemRepository> = (txContext) => {
  const transaction = toTransaction(txContext);

  return {
    async listByType(typeId: string, options: ItemListOptions): Promise<Page<MasterDataItem>> {
      const conditions: WhereOptions<InferAttributes<MasterDataItemModel>>[] = [{ typeId }];

      if (options.activeOnly) conditions.push({ isActive: true });
      if (options.search) {
        conditions.push({
          [Op.or]: [
            { code: { [Op.iLike]: `%${options.search}%` } },
            { label: { [Op.iLike]: `%${options.search}%` } },
          ],
        });
      }

      const { rows, count } = await MasterDataItemModel.findAndCountAll({
        where: { [Op.and]: conditions },
        // sortOrder is the whole reason the column exists: it lets an editor
        // control the order a dropdown renders in.
        order: [
          ['sortOrder', 'ASC'],
          ['label', 'ASC'],
        ],
        limit: options.pageSize,
        offset: (options.page - 1) * options.pageSize,
        transaction,
      });

      return { rows: rows.map(toItem), total: count };
    },

    async findByCode(typeId: string, code: string): Promise<MasterDataItem | null> {
      const model = await MasterDataItemModel.findOne({ where: { typeId, code }, transaction });
      return model ? toItem(model) : null;
    },

    async create(input: CreateItemInput): Promise<MasterDataItem> {
      const model = await translateWriteErrors(() =>
        MasterDataItemModel.create(
          {
            typeId: input.typeId,
            code: input.code,
            label: input.label,
            meta: input.meta ?? null,
            sortOrder: input.sortOrder ?? 0,
            isActive: input.isActive ?? true,
          },
          { transaction },
        ),
      );

      return toItem(model);
    },

    async update(id: string, input: UpdateItemInput): Promise<MasterDataItem | null> {
      const model = await MasterDataItemModel.findByPk(id, { transaction });
      if (!model) return null;

      if (input.label !== undefined) model.label = input.label;
      if (input.meta !== undefined) model.meta = input.meta ?? null;
      if (input.sortOrder !== undefined) model.sortOrder = input.sortOrder;
      if (input.isActive !== undefined) model.isActive = input.isActive;

      await translateWriteErrors(() => model.save({ transaction }));
      return toItem(model);
    },

    async delete(id: string): Promise<boolean> {
      const deleted = await MasterDataItemModel.destroy({ where: { id }, transaction });
      return deleted > 0;
    },

    async countByType(typeId: string): Promise<number> {
      return MasterDataItemModel.count({ where: { typeId }, transaction });
    },
  };
};
