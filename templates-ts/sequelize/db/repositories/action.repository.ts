import { Op } from 'sequelize';

import type { ListOptions, Page } from '../../core/pagination.js';
import type { ActionRepository } from '../../modules/action/action.repository.interface.js';
import type {
  Action,
  CreateActionInput,
  UpdateActionInput,
} from '../../modules/action/action.types.js';
import { toTransaction } from '../connection.js';
import { translateWriteErrors } from '../errors.js';
import { ActionModel } from '../models/action.model.js';
import type { Repo } from '../unit-of-work.js';

/**
 * Sequelize implementation of `ActionRepository`. Together with
 * `action.model.ts`, the only ORM-aware code in this module.
 */

const toAction = (model: ActionModel): Action => ({
  id: model.id,
  name: model.name,
  description: model.description ?? null,
});

export const actionRepository: Repo<ActionRepository> = (txContext) => {
  const transaction = toTransaction(txContext);

  return {
    async list(options: ListOptions): Promise<Page<Action>> {
      const { rows, count } = await ActionModel.findAndCountAll({
        where: options.search ? { name: { [Op.iLike]: `%${options.search}%` } } : {},
        order: [['name', 'ASC']],
        limit: options.pageSize,
        offset: (options.page - 1) * options.pageSize,
        transaction,
      });

      return { rows: rows.map(toAction), total: count };
    },

    async findById(id: string): Promise<Action | null> {
      const model = await ActionModel.findByPk(id, { transaction });
      return model ? toAction(model) : null;
    },

    async findByName(name: string): Promise<Action | null> {
      const model = await ActionModel.findOne({ where: { name }, transaction });
      return model ? toAction(model) : null;
    },

    async findExistingIds(ids: string[]): Promise<string[]> {
      if (ids.length === 0) return [];

      const rows = await ActionModel.findAll({
        where: { id: { [Op.in]: ids } },
        attributes: ['id'],
        transaction,
      });

      return rows.map((row) => row.id);
    },

    async create(input: CreateActionInput): Promise<Action> {
      const model = await translateWriteErrors(() =>
        ActionModel.create(
          { name: input.name, description: input.description ?? null },
          { transaction },
        ),
      );

      return toAction(model);
    },

    async update(id: string, input: UpdateActionInput): Promise<Action | null> {
      const model = await ActionModel.findByPk(id, { transaction });
      if (!model) return null;

      if (input.name !== undefined) model.name = input.name;
      if (input.description !== undefined) model.description = input.description ?? null;

      await translateWriteErrors(() => model.save({ transaction }));
      return toAction(model);
    },

    async delete(id: string): Promise<boolean> {
      const deleted = await ActionModel.destroy({ where: { id }, transaction });
      return deleted > 0;
    },
  };
};
