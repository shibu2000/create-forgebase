import supertest from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';

import { createApp } from '../../src/core/app.js';
import { createApiRouter } from '../../src/routes.js';

/**
 * Builds the application exactly as `server.ts` does and wraps it in a
 * Supertest agent.
 *
 * No listening socket: Supertest binds an ephemeral port per request. That
 * means integration tests exercise the real middleware chain — helmet, CORS,
 * body limits, validation, the guards, the error handler — without any of
 * them being stubbed.
 */
export function buildTestApp(): TestAgent {
  const app = createApp((instance) => {
    instance.use(createApiRouter());
  });

  return supertest(app);
}

/** Logs in and returns the bearer token, so tests read as a user would act. */
export async function login(agent: TestAgent, email: string, password: string): Promise<string> {
  const response = await agent.post('/auth/login').send({ email, password }).expect(200);
  return response.body.data.accessToken as string;
}

/** Convenience for the common "authenticated GET/POST" shape. */
export function asUser(agent: TestAgent, token: string) {
  return {
    get: (path: string) => agent.get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string) => agent.post(path).set('Authorization', `Bearer ${token}`),
    patch: (path: string) => agent.patch(path).set('Authorization', `Bearer ${token}`),
    put: (path: string) => agent.put(path).set('Authorization', `Bearer ${token}`),
    delete: (path: string) => agent.delete(path).set('Authorization', `Bearer ${token}`),
  };
}
