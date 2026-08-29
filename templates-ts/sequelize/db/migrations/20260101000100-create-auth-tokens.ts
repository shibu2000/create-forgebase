import { DataTypes, Sequelize } from 'sequelize';

import type { Migration } from '../migrator.js';

/**
 * Token tables for the auth module.
 *
 * Both store a SHA-256 hex digest — 64 characters — and both cascade from
 * `users`, so deleting an account takes its live sessions and any outstanding
 * reset links with it.
 */

const tokenColumns = {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: Sequelize.literal('gen_random_uuid()'),
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  },
  token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
};

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.createTable('refresh_tokens', {
    ...tokenColumns,
    revoked_at: { type: DataTypes.DATE, allowNull: true },
  });

  await queryInterface.createTable('password_reset_tokens', {
    ...tokenColumns,
    used_at: { type: DataTypes.DATE, allowNull: true },
  });

  // Revoking every session for one user is a routine operation — on password
  // reset, and on detecting a reused token.
  await queryInterface.addIndex('refresh_tokens', ['user_id'], {
    name: 'refresh_tokens_user_id_idx',
  });
  await queryInterface.addIndex('password_reset_tokens', ['user_id'], {
    name: 'password_reset_tokens_user_id_idx',
  });

  // Supports the expired-token sweep.
  await queryInterface.addIndex('refresh_tokens', ['expires_at'], {
    name: 'refresh_tokens_expires_at_idx',
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('password_reset_tokens');
  await queryInterface.dropTable('refresh_tokens');
};
