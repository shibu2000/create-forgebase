import { DataTypes, Sequelize } from 'sequelize';

import type { Migration } from '../migrator.js';

/**
 * Reference data: a generic type/item pair.
 *
 * Two tables serve every lookup list a project will ever need. Adding a new
 * kind — "TOUR_TYPE", "CURRENCY", "CANCELLATION_REASON" — is an INSERT, not a
 * migration.
 */

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.createTable('master_data_types', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.literal('gen_random_uuid()'),
    },
    code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(150), allowNull: false },
    description: { type: DataTypes.STRING(500), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
  });

  await queryInterface.createTable('master_data_items', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: Sequelize.literal('gen_random_uuid()'),
    },
    type_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'master_data_types', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    code: { type: DataTypes.STRING(64), allowNull: false },
    label: { type: DataTypes.STRING(255), allowNull: false },
    meta: { type: DataTypes.JSONB, allowNull: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
  });

  // Codes are unique within their type, not globally — "ACTIVE" can exist
  // under both STATUS and VISIBILITY.
  await queryInterface.addConstraint('master_data_items', {
    fields: ['type_id', 'code'],
    type: 'unique',
    name: 'master_data_items_type_id_code_key',
  });

  // Every item read is scoped by type.
  await queryInterface.addIndex('master_data_items', ['type_id'], {
    name: 'master_data_items_type_id_idx',
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('master_data_items');
  await queryInterface.dropTable('master_data_types');
};
