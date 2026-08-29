import nodemailer, { type Transporter } from 'nodemailer';

import { createLogger } from '../../core/logger.js';

import { emailConfig, isSmtpConfigured } from './email.config.js';
import type { EmailMessage, EmailService } from './email.service.interface.js';

/**
 * SMTP delivery via Nodemailer.
 *
 * Provider-agnostic on purpose — it speaks plain SMTP, so it works with
 * Postmark, SES, Mailgun, Resend, a corporate relay or Mailpit locally
 * without a code change, only different environment values.
 */

const log = createLogger('email');

function createTransport(): Transporter {
  return nodemailer.createTransport({
    host: emailConfig.SMTP_HOST,
    port: emailConfig.SMTP_PORT,
    secure: emailConfig.SMTP_SECURE,
    auth:
      emailConfig.SMTP_USER && emailConfig.SMTP_PASS
        ? { user: emailConfig.SMTP_USER, pass: emailConfig.SMTP_PASS }
        : undefined,
  });
}

export function createSmtpEmailService(): EmailService {
  const transport = createTransport();

  return {
    async send(message: EmailMessage): Promise<void> {
      await transport.sendMail({
        from: emailConfig.MAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      // Recipient and subject only — never the body, which carries reset
      // links and other single-use secrets.
      log.info({ to: message.to, subject: message.subject }, 'Email sent');
    },
  };
}

/**
 * Fallback used when SMTP is not configured.
 *
 * A project scaffolded with "skip SMTP" still has to run, and a developer
 * still has to be able to complete a password reset. This writes the message
 * to the log — including the link, which is the whole point — instead of
 * failing or silently dropping it.
 */
export function createLogEmailService(): EmailService {
  return {
    async send(message: EmailMessage): Promise<void> {
      log.warn(
        { to: message.to, subject: message.subject, body: message.text },
        'SMTP is not configured — email written to the log instead of being sent',
      );
    },
  };
}

/** Picks a provider from the environment. */
export function createEmailService(): EmailService {
  if (!isSmtpConfigured) {
    log.warn('SMTP_HOST is not set; outgoing email will be logged, not delivered');
    return createLogEmailService();
  }

  return createSmtpEmailService();
}

/**
 * Verifies the SMTP connection. Registered as a readiness check when SMTP is
 * configured, so a bad relay shows up at boot rather than the first time
 * somebody forgets their password.
 */
export async function verifyEmailTransport(): Promise<void> {
  if (!isSmtpConfigured) return;
  await createTransport().verify();
}
