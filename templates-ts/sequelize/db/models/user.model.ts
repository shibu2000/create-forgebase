import {
  type CreationOptional,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
} from 'sequelize';

import { sequelize } from '../connection.js';

/**
 * Sequelize models owned by the user module: the user itself, and the
 * `user_roles` join table that records which roles they hold.
 *
 * The connection sets `underscored: true`, so camelCase attributes map to
 * snake_case columns automatically — `passwordHash` is `password_hash` in the
 * database without a per-field declaration.
 *
 * These types never leave the repository layer.
 */

export class UserModel extends Model<
  InferAttributes<UserModel>,
  InferCreationAttributes<UserModel>
> {
  declare id: CreationOptional<string>;
  declare email: string;
  declare passwordHash: string;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

UserModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.TEXT, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'users', modelName: 'user' },
);

/**
 * Declared as a model rather than left to the association helper, so role
 * assignment can be written explicitly inside a transaction.
 */
export class UserRoleModel extends Model<
  InferAttributes<UserRoleModel>,
  InferCreationAttributes<UserRoleModel>
> {
  declare userId: string;
  declare roleId: string;
}

UserRoleModel.init(
  {
    userId: { type: DataTypes.UUID, primaryKey: true },
    roleId: { type: DataTypes.UUID, primaryKey: true },
  },
  { sequelize, tableName: 'user_roles', modelName: 'userRole', timestamps: false },
);
