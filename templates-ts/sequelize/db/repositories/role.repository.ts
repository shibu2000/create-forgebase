import { Op, QueryTypes } from 'sequelize';

import type { ListOptions, Page } from '../../core/pagination.js';
import type { RoleRepository } from '../../modules/role/role.repository.interface.js';
import type {
  CreateRoleInput,
  GrantedAction,
  Role,
  UpdateRoleInput,
} from '../../modules/role/role.types.js';
import { sequelize, toTransaction } from '../connection.js';
import { translateWriteErrors } from '../errors.js';
import { RoleActionModel, RoleModel } from '../models/role.model.js';
import type { Repo } from '../unit-of-work.js';

/**
 * Sequelize implementation of `RoleRepository`.
 *
 * `findActions` joins into the actions table with SQL rather than a Sequelize
 * association, so this module never imports the action module's models.
 */

const toRole = (model: RoleModel): Role => ({
  id: model.id,
  name: model.name,
  description: model.description ?? null,
});

export const roleRepository: Repo<RoleRepository> = (txContext) => {
  const transaction = toTransaction(txContext);

  return {
    async list(options: ListOptions): Promise<Page<Role>> {
      const { rows, count } = await RoleModel.findAndCountAll({
        where: options.search ? { name: { [Op.iLike]: `%${options.search}%` } } : {},
        order: [['name', 'ASC']],
        limit: options.pageSize,
        offset: (options.page - 1) * options.pageSize,
        transaction,
      });

      return { rows: rows.map(toRole), total: count };
    },

    async findById(id: string): Promise<Role | null> {
      const model = await RoleModel.findByPk(id, { transaction });
      return model ? toRole(model) : null;
    },

    async findByName(name: string): Promise<Role | null> {
      const model = await RoleModel.findOne({ where: { name }, transaction });
      return model ? toRole(model) : null;
    },

    async findExistingIds(ids: string[]): Promise<string[]> {
      if (ids.length === 0) return [];

      const rows = await RoleModel.findAll({
        where: { id: { [Op.in]: ids } },
        attributes: ['id'],
        transaction,
      });

      return rows.map((row) => row.id);
    },

    async create(input: CreateRoleInput): Promise<Role> {
      const model = await translateWriteErrors(() =>
        RoleModel.create(
          { name: input.name, description: input.description ?? null },
          { transaction },
        ),
      );

      return toRole(model);
    },

    async update(id: string, input: UpdateRoleInput): Promise<Role | null> {
      const model = await RoleModel.findByPk(id, { transaction });
      if (!model) return null;

      if (input.name !== undefined) model.name = input.name;
      if (input.description !== undefined) model.description = input.description ?? null;

      await translateWriteErrors(() => model.save({ transaction }));
      return toRole(model);
    },

    async delete(id: string): Promise<boolean> {
      const deleted = await RoleModel.destroy({ where: { id }, transaction });
      return deleted > 0;
    },

    async findActions(roleId: string): Promise<GrantedAction[]> {
      return sequelize.query<GrantedAction>(
        `SELECT a.id, a.name, a.description
           FROM actions a
           JOIN role_actions ra ON ra.action_id = a.id
          WHERE ra.role_id = :roleId
          ORDER BY a.name`,
        { replacements: { roleId }, type: QueryTypes.SELECT, transaction },
      );
    },

    async setActions(roleId: string, actionIds: string[]): Promise<void> {
      await RoleActionModel.destroy({ where: { roleId }, transaction });

      if (actionIds.length === 0) return;

      await RoleActionModel.bulkCreate(
        actionIds.map((actionId) => ({ roleId, actionId })),
        { transaction, ignoreDuplicates: true },
      );
    },
  };
};
