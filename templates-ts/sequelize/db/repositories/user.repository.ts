import { Op, QueryTypes } from 'sequelize';

import type { ListOptions, Page } from '../../core/pagination.js';
import type { UserRepository } from '../../modules/user/user.repository.interface.js';
import type {
  AssignedRole,
  CreateUserInput,
  UpdateUserInput,
  User,
  UserWithRoles,
  UserWithSecret,
} from '../../modules/user/user.types.js';
import { sequelize, toTransaction } from '../connection.js';
import { translateWriteErrors } from '../errors.js';
import { UserModel, UserRoleModel } from '../models/user.model.js';
import type { Repo } from '../unit-of-work.js';

/**
 * Sequelize implementation of `UserRepository`.
 *
 * This file and `user.model.ts` are the only places in the user module that
 * import Sequelize. Everything above them is shared verbatim with the Drizzle
 * variant.
 *
 * Reads that span into the role and action tables are written as SQL joins
 * rather than Sequelize associations. That keeps this module from importing
 * the role module's models — the tables are a shared schema, but the code
 * stays decoupled.
 */

const toUser = (model: UserModel): User => ({
  id: model.id,
  email: model.email,
  isActive: model.isActive,
  createdAt: model.createdAt,
  updatedAt: model.updatedAt,
});

const toUserWithSecret = (model: UserModel): UserWithSecret => ({
  ...toUser(model),
  passwordHash: model.passwordHash,
});

export const userRepository: Repo<UserRepository> = (txContext) => {
  const transaction = toTransaction(txContext);

  return {
    async list(options: ListOptions): Promise<Page<User>> {
      const { rows, count } = await UserModel.findAndCountAll({
        where: options.search ? { email: { [Op.iLike]: `%${options.search}%` } } : {},
        order: [['createdAt', 'DESC']],
        limit: options.pageSize,
        offset: (options.page - 1) * options.pageSize,
        transaction,
      });

      return { rows: rows.map(toUser), total: count };
    },

    async findById(id: string): Promise<User | null> {
      const model = await UserModel.findByPk(id, { transaction });
      return model ? toUser(model) : null;
    },

    async findWithRoles(id: string): Promise<UserWithRoles | null> {
      const model = await UserModel.findByPk(id, { transaction });
      if (!model) return null;

      const roles = await sequelize.query<AssignedRole>(
        `SELECT r.id, r.name
           FROM roles r
           JOIN user_roles ur ON ur.role_id = r.id
          WHERE ur.user_id = :id
          ORDER BY r.name`,
        { replacements: { id }, type: QueryTypes.SELECT, transaction },
      );

      return { ...toUser(model), roles };
    },

    async findByEmail(email: string): Promise<UserWithSecret | null> {
      const model = await UserModel.findOne({ where: { email }, transaction });
      return model ? toUserWithSecret(model) : null;
    },

    async create(input: CreateUserInput): Promise<User> {
      const model = await translateWriteErrors(() =>
        UserModel.create(
          {
            email: input.email,
            passwordHash: input.passwordHash,
            isActive: input.isActive ?? true,
          },
          { transaction },
        ),
      );

      return toUser(model);
    },

    async update(id: string, input: UpdateUserInput): Promise<User | null> {
      const model = await UserModel.findByPk(id, { transaction });
      if (!model) return null;

      // Only assign what was actually supplied; an absent field must not
      // overwrite a stored value with undefined.
      if (input.email !== undefined) model.email = input.email;
      if (input.passwordHash !== undefined) model.passwordHash = input.passwordHash;
      if (input.isActive !== undefined) model.isActive = input.isActive;

      await translateWriteErrors(() => model.save({ transaction }));
      return toUser(model);
    },

    async delete(id: string): Promise<boolean> {
      const deleted = await UserModel.destroy({ where: { id }, transaction });
      return deleted > 0;
    },

    async setRoles(userId: string, roleIds: string[]): Promise<void> {
      // Replace wholesale: clear then insert, inside whatever transaction the
      // caller opened, so the user is never briefly role-less to a reader.
      await UserRoleModel.destroy({ where: { userId }, transaction });

      if (roleIds.length === 0) return;

      await UserRoleModel.bulkCreate(
        roleIds.map((roleId) => ({ userId, roleId })),
        { transaction, ignoreDuplicates: true },
      );
    },

    async findEffectiveActionNames(userId: string): Promise<string[]> {
      // A three-table set union, which reads far more clearly as SQL than as
      // nested eager-loaded includes.
      const rows = await sequelize.query<{ name: string }>(
        `SELECT DISTINCT a.name
           FROM actions a
           JOIN role_actions ra ON ra.action_id = a.id
           JOIN user_roles ur ON ur.role_id = ra.role_id
          WHERE ur.user_id = :userId
          ORDER BY a.name`,
        { replacements: { userId }, type: QueryTypes.SELECT, transaction },
      );

      return rows.map((row) => row.name);
    },
  };
};
