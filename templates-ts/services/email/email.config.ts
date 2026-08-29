import { z } from 'zod';

import { booleanish, defineEnv } from '../../core/env.js';

/**
 * SMTP settings.
 *
 * Every field is optional: a project scaffolded with "skip SMTP" must still
 * boot and still be developable. When `SMTP_HOST` is absent the log provider
 * is used instead, so password-reset flows work end to end locally without
 * anyone standing up a mail server.
 */
export const emailConfig = defineEnv(
  z.object({
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    /** True for implicit TLS on port 465; false for STARTTLS on 587. */
    SMTP_SECURE: booleanish(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),

    /** Envelope sender. Many providers reject mail whose From is not verified. */
    MAIL_FROM: z.string().default('no-reply@example.com'),

    /** Public base URL, used to build links in outgoing mail. */
    APP_URL: z.string().url().default('http://localhost:3000'),
  }),
);

export const isSmtpConfigured = Boolean(emailConfig.SMTP_HOST);
