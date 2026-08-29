import { DataTypes, Sequelize } from 'sequelize';

import type { Migration } from '../migrator.js';

/**
 * Creates the user/role/action graph.
 *
 * Migrations live on one central timeline rather than inside each module,
 * because a migration routinely spans modules — this very first one creates
 * `user_roles`, which references both `users` and `roles`. One ordered
 * timeline is also what every mature migration tool converged on.
 *
 * The join tables cascade on delete: removing a role should retract it from
 * every user that held it, not leave orphaned rows or block the delete.
 */

const timestamps = {
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
};

const uuidPk = {
  type: DataTypes.UUID,
  primaryKey: true,
  defaultValue: Sequelize.literal('gen_random_uuid()'),
};

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.createTable('users', {
    id: uuidPk,
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    password_hash: { type: DataTypes.TEXT, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    ...timestamps,
  });

  await queryInterface.createTable('roles', {
    id: uuidPk,
    name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    description: { type: DataTypes.STRING(500), allowNull: true },
    ...timestamps,
  });

  await queryInterface.createTable('actions', {
    id: uuidPk,
    name: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    description: { type: DataTypes.STRING(500), allowNull: true },
    ...timestamps,
  });

  await queryInterface.createTable('user_roles', {
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    role_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: { model: 'roles', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
  });

  await queryInterface.createTable('role_actions', {
    role_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: { model: 'roles', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    action_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: { model: 'actions', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
  });

  // Reverse-direction lookups: "which users hold this role", and the
  // permission resolution join, which walks role_actions by role.
  await queryInterface.addIndex('user_roles', ['role_id'], { name: 'user_roles_role_id_idx' });
  await queryInterface.addIndex('role_actions', ['action_id'], {
    name: 'role_actions_action_id_idx',
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('role_actions');
  await queryInterface.dropTable('user_roles');
  await queryInterface.dropTable('actions');
  await queryInterface.dropTable('roles');
  await queryInterface.dropTable('users');
};
