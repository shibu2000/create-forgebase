import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * Populate `process.env` from `.env` before any schema below is parsed.
 *
 * Called explicitly rather than imported for its side effect. A bare
 * `import 'dotenv/config'` has to be the first import to be correct, which
 * makes it silently reorderable by any import-sorting tool — a subtle way to
 * break configuration loading. A statement cannot be moved above the imports.
 *
 * `quiet` suppresses dotenv's startup banner, which would otherwise be the
 * first thing every process prints, outside the structured log.
 */
loadDotenv({ quiet: true });

/**
 * Environment parsing and validation.
 *
 * Every variable the application depends on is declared here and validated
 * once, at process boot. If anything is missing or malformed the process
 * exits immediately with a readable report instead of failing later at an
 * arbitrary call site.
 *
 * Fragments (database, auth, mail) declare their own variables by calling
 * `defineEnv` with their own schema, rather than editing this one.
 */

const csv = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const TRUTHY = new Set(['true', '1', 'yes', 'on']);

/**
 * Boolean from a string. `z.coerce.boolean()` is not usable here — it treats
 * the string "false" as true, since it is non-empty.
 */
export const booleanish = (defaultValue: boolean) =>
  z
    .string()
    .default(String(defaultValue))
    .transform((value) => TRUTHY.has(value.toLowerCase()));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Port the HTTP server binds to. */
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Interface the HTTP server binds to. */
  HOST: z.string().min(1).default('0.0.0.0'),

  /** Pino log level. */
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /**
   * Comma-separated list of origins allowed to make cross-origin requests.
   * Empty means no cross-origin browser traffic is permitted.
   */
  CORS_ORIGINS: z.string().default('').transform(csv),

  /** Max accepted request body size, as understood by the `bytes` package. */
  BODY_LIMIT: z.string().min(1).default('10kb'),

  /**
   * Express `trust proxy` setting: 'true', 'false', a hop count, or a
   * comma-separated list of trusted addresses/subnets.
   */
  TRUST_PROXY: z.string().default('false'),

  /** Rate limit window and ceiling for sensitive auth endpoints. */
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  /** How long in-flight requests get to finish during a graceful shutdown. */
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export type Env = z.infer<typeof envSchema>;

/**
 * A variable that is present but blank means "not set".
 *
 * `.env` files spell an unset optional variable as `SMTP_HOST=`, and dotenv
 * faithfully turns that into an empty string — which is a *present* value as
 * far as zod is concerned, so `.optional()` does not apply and `.min(1)`
 * fails. The result is that the scaffold's own documented default ("leave
 * SMTP_HOST blank to log mail instead of sending it") refuses to boot.
 *
 * Dropping blanks before parsing makes a blank line in `.env` mean what
 * everyone already reads it as, and lets schema defaults apply to it.
 */
function withoutBlanks(raw: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ''));
}

/**
 * Parse a raw environment bag. Exported separately from `env` so tests can
 * exercise validation without terminating the process.
 */
export function parseEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(withoutBlanks(raw));
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.') || '(root)';
      return `  - ${path}: ${issue.message}`;
    })
    .join('\n');
}

/**
 * Parse a schema against the environment, or exit with a readable report.
 *
 * Fragments (database, auth, mail) call this with their own schema instead of
 * editing the core one, so each fragment owns the variables it needs and
 * still fails fast at boot. Because fragment modules are imported before the
 * server starts listening, a missing variable is caught the same way a core
 * one is.
 */
export function defineEnv<T extends z.ZodType>(schema: T): z.infer<T> {
  const result = schema.safeParse(withoutBlanks(process.env));

  if (!result.success) {
    // The logger depends on env, so this one report has to use console.
    console.error(
      `\nInvalid environment configuration:\n${formatIssues(result.error)}\n\n` +
        'See .env.example for the full list of supported variables.\n',
    );
    process.exit(1);
  }

  return result.data;
}

export const env: Env = defineEnv(envSchema);

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Normalises TRUST_PROXY into the shape Express expects. */
export function trustProxySetting(value: string = env.TRUST_PROXY): boolean | number | string[] {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return csv(value);
}
