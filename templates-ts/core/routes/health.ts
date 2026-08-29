import { type RequestHandler, Router } from 'express';

import { describe } from '../middleware/route-metadata.js';
import { errorBody, sendSuccess } from '../response.js';

/**
 * Liveness and readiness endpoints.
 *
 * `GET /health` answers "is the process up" and never touches a dependency,
 * so an orchestrator does not restart the app because the database blinked.
 *
 * `GET /health/ready` answers "can this instance serve traffic" by running
 * every registered check. Fragments added later (database connection, mail
 * transport) register their own check here instead of editing this file.
 */

export type ReadinessCheck = () => Promise<void> | void;

const checks = new Map<string, ReadinessCheck>();

export function registerReadinessCheck(name: string, check: ReadinessCheck): void {
  checks.set(name, check);
}

export function clearReadinessChecks(): void {
  checks.clear();
}

interface CheckResult {
  status: 'up' | 'down';
  error?: string;
}

async function runChecks(): Promise<{ ok: boolean; results: Record<string, CheckResult> }> {
  const entries = await Promise.all(
    [...checks.entries()].map(async ([name, check]): Promise<[string, CheckResult]> => {
      try {
        await check();
        return [name, { status: 'up' }];
      } catch (error) {
        return [
          name,
          { status: 'down', error: error instanceof Error ? error.message : 'check failed' },
        ];
      }
    }),
  );

  const results = Object.fromEntries(entries);
  const ok = entries.every(([, result]) => result.status === 'up');
  return { ok, results };
}

export const healthRouter: Router = Router();

/** Liveness: the process is up and serving. Says nothing about dependencies. */
const liveness: RequestHandler = (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
};

/** Readiness: every registered dependency answered. */
const readiness: RequestHandler = async (_req, res) => {
  const { ok, results } = await runChecks();
  const timestamp = new Date().toISOString();

  if (!ok) {
    // Error envelope, so a client can branch on `success` alone.
    res.status(503).json(
      errorBody('NOT_READY', 'One or more dependencies are unavailable', {
        checks: results,
        timestamp,
      }),
    );
    return;
  }

  sendSuccess(res, { status: 'ready', checks: results, timestamp });
};

healthRouter.get(
  '/',
  describe(liveness, 'Liveness probe', 'Answers as soon as the process is serving traffic.'),
);

healthRouter.get(
  '/ready',
  describe(
    readiness,
    'Readiness probe',
    'Returns 503 until every registered dependency answers. Point your orchestrator here.',
  ),
);
