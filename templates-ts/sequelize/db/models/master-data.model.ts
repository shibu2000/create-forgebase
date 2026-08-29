import {
  type CreationOptional,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
} from 'sequelize';

import { sequelize } from '../connection.js';

/** Reference-data tables: a type, and the items belonging to it. */

export class MasterDataTypeModel extends Model<
  InferAttributes<MasterDataTypeModel>,
  InferCreationAttributes<MasterDataTypeModel>
> {
  declare id: CreationOptional<string>;
  declare code: string;
  declare name: string;
  declare description: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

MasterDataTypeModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(150), allowNull: false },
    description: { type: DataTypes.STRING(500), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'master_data_types', modelName: 'masterDataType' },
);

export class MasterDataItemModel extends Model<
  InferAttributes<MasterDataItemModel>,
  InferCreationAttributes<MasterDataItemModel>
> {
  declare id: CreationOptional<string>;
  declare typeId: string;
  declare code: string;
  declare label: string;
  declare meta: CreationOptional<Record<string, unknown> | null>;
  declare sortOrder: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

MasterDataItemModel.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    typeId: { type: DataTypes.UUID, allowNull: false },
    code: { type: DataTypes.STRING(64), allowNull: false },
    label: { type: DataTypes.STRING(255), allowNull: false },
    // jsonb, not json: it is queryable and indexable, and normalises on write.
    meta: { type: DataTypes.JSONB, allowNull: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, tableName: 'master_data_items', modelName: 'masterDataItem' },
);
