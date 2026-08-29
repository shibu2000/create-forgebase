import { Op } from 'sequelize';

import type {
  PasswordResetTokenRepository,
  RefreshTokenRepository,
} from '../../modules/auth/auth.repository.interface.js';
import type {
  CreateTokenRecord,
  PasswordResetRecord,
  RefreshTokenRecord,
} from '../../modules/auth/auth.types.js';
import { toTransaction } from '../connection.js';
import { translateWriteErrors } from '../errors.js';
import { PasswordResetTokenModel, RefreshTokenModel } from '../models/auth.model.js';
import type { Repo } from '../unit-of-work.js';

/** Sequelize implementations of the auth module's token repositories. */

const toRefresh = (model: RefreshTokenModel): RefreshTokenRecord => ({
  id: model.id,
  userId: model.userId,
  expiresAt: model.expiresAt,
  revokedAt: model.revokedAt ?? null,
});

const toReset = (model: PasswordResetTokenModel): PasswordResetRecord => ({
  id: model.id,
  userId: model.userId,
  expiresAt: model.expiresAt,
  usedAt: model.usedAt ?? null,
});

export const refreshTokenRepository: Repo<RefreshTokenRepository> = (txContext) => {
  const transaction = toTransaction(txContext);

  return {
    async create(input: CreateTokenRecord): Promise<RefreshTokenRecord> {
      const model = await translateWriteErrors(() =>
        RefreshTokenModel.create(
          { userId: input.userId, tokenHash: input.tokenHash, expiresAt: input.expiresAt },
          { transaction },
        ),
      );

      return toRefresh(model);
    },

    async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
      const model = await RefreshTokenModel.findOne({ where: { tokenHash }, transaction });
      return model ? toRefresh(model) : null;
    },

    async revoke(id: string): Promise<void> {
      await RefreshTokenModel.update({ revokedAt: new Date() }, { where: { id }, transaction });
    },

    async revokeAllForUser(userId: string): Promise<number> {
      const [affected] = await RefreshTokenModel.update(
        { revokedAt: new Date() },
        { where: { userId, revokedAt: { [Op.is]: null } }, transaction },
      );

      return affected;
    },

    async deleteExpired(before: Date): Promise<number> {
      return RefreshTokenModel.destroy({
        where: { expiresAt: { [Op.lt]: before } },
        transaction,
      });
    },
  };
};

export const passwordResetTokenRepository: Repo<PasswordResetTokenRepository> = (txContext) => {
  const transaction = toTransaction(txContext);

  return {
    async create(input: CreateTokenRecord): Promise<PasswordResetRecord> {
      const model = await translateWriteErrors(() =>
        PasswordResetTokenModel.create(
          { userId: input.userId, tokenHash: input.tokenHash, expiresAt: input.expiresAt },
          { transaction },
        ),
      );

      return toReset(model);
    },

    async findByHash(tokenHash: string): Promise<PasswordResetRecord | null> {
      const model = await PasswordResetTokenModel.findOne({ where: { tokenHash }, transaction });
      return model ? toReset(model) : null;
    },

    async markUsed(id: string): Promise<void> {
      await PasswordResetTokenModel.update({ usedAt: new Date() }, { where: { id }, transaction });
    },

    async invalidateAllForUser(userId: string): Promise<number> {
      const [affected] = await PasswordResetTokenModel.update(
        { usedAt: new Date() },
        { where: { userId, usedAt: { [Op.is]: null } }, transaction },
      );

      return affected;
    },
  };
};
