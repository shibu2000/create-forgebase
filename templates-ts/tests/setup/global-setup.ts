import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { promisify } from 'node:util';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

const execFileAsync = promisify(execFile);

/**
 * Starts a disposable PostgreSQL container and migrates it, once for the
 * whole test run.
 *
 * This is what makes `npm test` work on a clean clone with nothing but Docker
 * and Node installed — no local Postgres, no `.env.test`, no "ask a teammate
 * for the connection string" step. The container is thrown away afterwards,
 * so a test run can never corrupt a database someone cares about.
 */

declare global {
  var __PG_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

/**
 * Points Testcontainers at whichever Docker is actually running.
 *
 * Docker Desktop and CI runners expose the socket where Testcontainers looks
 * by default. Colima, Rancher Desktop and Podman put it under the user's home
 * directory instead, and Testcontainers then reports only "could not find a
 * working container runtime strategy" — accurate but unhelpful. Asking the
 * Docker CLI for its active context resolves all of them without the
 * developer having to know any of this.
 */
async function ensureDockerHost(): Promise<void> {
  if (process.env.DOCKER_HOST) return;

  const defaultSockets = ['/var/run/docker.sock', `${homedir()}/.docker/run/docker.sock`];
  if (defaultSockets.some((socket) => existsSync(socket))) return;

  try {
    const { stdout } = await execFileAsync('docker', [
      'context',
      'inspect',
      '--format',
      '{{.Endpoints.docker.Host}}',
    ]);

    const host = stdout.trim();
    if (!host) return;

    process.env.DOCKER_HOST = host;
    // Ryuk, the reaper container, mounts the socket from inside the VM, where
    // it is always at the canonical path regardless of where the host maps it.
    process.env.TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE ??= '/var/run/docker.sock';
  } catch {
    // Leave it to Testcontainers to report that Docker is unreachable.
  }
}

export default async function globalSetup(): Promise<void> {
  await ensureDockerHost();

  const container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('forgebase_test')
    .withUsername('forgebase')
    .withPassword('forgebase')
    // The data is discarded with the container, so durability buys nothing
    // and costs a fsync on every commit.
    .withCommand(['postgres', '-c', 'fsync=off', '-c', 'synchronous_commit=off'])
    .start();

  // Must be set before anything imports the app: `db.config.ts` reads the
  // environment at module load and exits the process if it is missing.
  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';

  // Secrets the app requires. Values are throwaway — this database exists for
  // the next thirty seconds.
  process.env.JWT_ACCESS_SECRET ??= 'test-only-secret-that-is-long-enough-to-pass';
  process.env.ADMIN_EMAIL ??= 'admin@example.com';
  process.env.ADMIN_PASSWORD ??= 'test-admin-password';

  // Migrations run in a subprocess rather than by importing the migrator.
  // Jest transforms this file, but a dynamic `import()` inside it escapes to
  // Node's own loader, which cannot read TypeScript. Spawning also matches
  // how a real deploy migrates: as a separate step before the app starts.
  //
  // The command differs by language variant, and is decided here at runtime
  // for the same reason `jest.config` decides its transform that way: this
  // file is shared, and the JavaScript variant has neither tsx nor a `.ts`
  // migrator to point it at.
  const isTypeScriptProject = existsSync(new URL('../../tsconfig.json', import.meta.url));

  const [command, args] = isTypeScriptProject
    ? ['npx', ['tsx', 'src/db/migrator.ts']]
    : ['node', ['src/db/migrator.js']];

  await execFileAsync(command, args, { env: { ...process.env } });

  globalThis.__PG_CONTAINER__ = container;
}
