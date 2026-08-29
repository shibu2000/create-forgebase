import { z } from 'zod';

import { defineEnv } from '../../core/env.js';

/**
 * Auth settings.
 *
 * Secrets are required with a minimum length — a scaffold that boots with a
 * default signing key is a scaffold that ships one to production. There is
 * deliberately no fallback value.
 */
export const authConfig = defineEnv(
  z.object({
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'Must be at least 32 characters — generate with `openssl rand -base64 48`'),

    /** Access tokens are short-lived; the refresh token is what carries a session. */
    JWT_ACCESS_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60),

    /** How long a refresh token remains valid if never used. */
    REFRESH_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(30 * 24 * 60 * 60),

    /** Password reset links expire fast — they arrive over email in plain text. */
    PASSWORD_RESET_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60),

    /** Issuer/audience claims, checked on every verify. */
    JWT_ISSUER: z.string().default('forgebase'),
    JWT_AUDIENCE: z.string().default('forgebase-api'),
  }),
);
