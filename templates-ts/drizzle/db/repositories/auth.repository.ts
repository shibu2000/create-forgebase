import { and, eq, isNull, lt } from 'drizzle-orm';

import type {
  PasswordResetTokenRepository,
  RefreshTokenRepository,
} from '../../modules/auth/auth.repository.interface.js';
import type {
  CreateTokenRecord,
  PasswordResetRecord,
  RefreshTokenRecord,
} from '../../modules/auth/auth.types.js';
import { toClient } from '../connection.js';
import { translateWriteErrors } from '../errors.js';
import { passwordResetTokens, refreshTokens } from '../models/auth.model.js';
import type { Repo } from '../unit-of-work.js';

/** Drizzle implementations of the auth module's token repositories. */

type RefreshRow = typeof refreshTokens.$inferSelect;
type ResetRow = typeof passwordResetTokens.$inferSelect;

const toRefresh = (row: RefreshRow): RefreshTokenRecord => ({
  id: row.id,
  userId: row.userId,
  expiresAt: row.expiresAt,
  revokedAt: row.revokedAt ?? null,
});

const toReset = (row: ResetRow): PasswordResetRecord => ({
  id: row.id,
  userId: row.userId,
  expiresAt: row.expiresAt,
  usedAt: row.usedAt ?? null,
});

export const refreshTokenRepository: Repo<RefreshTokenRepository> = (tx) => {
  const client = toClient(tx);

  return {
    async create(input: CreateTokenRecord): Promise<RefreshTokenRecord> {
      const [row] = await translateWriteErrors(() =>
        client
          .insert(refreshTokens)
          .values({
            userId: input.userId,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
          })
          .returning(),
      );

      return toRefresh(row!);
    },

    async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
      const [row] = await client
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1);

      return row ? toRefresh(row) : null;
    },

    async revoke(id: string): Promise<void> {
      await client
        .update(refreshTokens)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(refreshTokens.id, id));
    },

    async revokeAllForUser(userId: string): Promise<number> {
      const revoked = await client
        .update(refreshTokens)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
        .returning({ id: refreshTokens.id });

      return revoked.length;
    },

    async deleteExpired(before: Date): Promise<number> {
      const deleted = await client
        .delete(refreshTokens)
        .where(lt(refreshTokens.expiresAt, before))
        .returning({ id: refreshTokens.id });

      return deleted.length;
    },
  };
};

export const passwordResetTokenRepository: Repo<PasswordResetTokenRepository> = (tx) => {
  const client = toClient(tx);

  return {
    async create(input: CreateTokenRecord): Promise<PasswordResetRecord> {
      const [row] = await translateWriteErrors(() =>
        client
          .insert(passwordResetTokens)
          .values({
            userId: input.userId,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
          })
          .returning(),
      );

      return toReset(row!);
    },

    async findByHash(tokenHash: string): Promise<PasswordResetRecord | null> {
      const [row] = await client
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, tokenHash))
        .limit(1);

      return row ? toReset(row) : null;
    },

    async markUsed(id: string): Promise<void> {
      await client
        .update(passwordResetTokens)
        .set({ usedAt: new Date(), updatedAt: new Date() })
        .where(eq(passwordResetTokens.id, id));
    },

    async invalidateAllForUser(userId: string): Promise<number> {
      const invalidated = await client
        .update(passwordResetTokens)
        .set({ usedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)))
        .returning({ id: passwordResetTokens.id });

      return invalidated.length;
    },
  };
};
