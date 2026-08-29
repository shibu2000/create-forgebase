import {
  type CreationOptional,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
} from 'sequelize';

import { sequelize } from '../connection.js';

/**
 * Models owned by the role module: the role itself, and the `role_actions`
 * join table recording which actions it grants.
 */

export class RoleModel extends Model<
  InferAttributes<RoleModel>,
  InferCreationAttributes<RoleModel>
> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare description: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

RoleModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    description: { type: DataTypes.STRING(500), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'roles', modelName: 'role' },
);

export class RoleActionModel extends Model<
  InferAttributes<RoleActionModel>,
  InferCreationAttributes<RoleActionModel>
> {
  declare roleId: string;
  declare actionId: string;
}

RoleActionModel.init(
  {
    roleId: { type: DataTypes.UUID, primaryKey: true },
    actionId: { type: DataTypes.UUID, primaryKey: true },
  },
  { sequelize, tableName: 'role_actions', modelName: 'roleAction', timestamps: false },
);
