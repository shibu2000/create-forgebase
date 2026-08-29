import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import type TestAgent from 'supertest/lib/agent.js';

import { closeDatabase } from '../../src/db/connection.js';
import { asUser, buildTestApp, login } from '../helpers/app.js';
import { resetDatabase, seedAdmin } from '../helpers/database.js';

/** Integration tests for the action module. */

let agent: TestAgent;
let api: ReturnType<typeof asUser>;

beforeEach(async () => {
  await resetDatabase();
  const admin = await seedAdmin();
  agent = buildTestApp();
  api = asUser(agent, await login(agent, admin.email, admin.password));
});

afterAll(async () => {
  await closeDatabase();
});

describe('action CRUD', () => {
  it('creates an action', async () => {
    const response = await api
      .post('/actions')
      .send({ name: 'report:export', description: 'Export reports' })
      .expect(201);

    expect(response.body.data.name).toBe('report:export');
  });

  it('enforces the resource:verb naming convention', async () => {
    const response = await api.post('/actions').send({ name: 'Not A Valid Name' }).expect(422);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details[0].path).toBe('body.name');
  });

  it('rejects a duplicate name with 409', async () => {
    await api.post('/actions').send({ name: 'report:export' }).expect(201);

    const response = await api.post('/actions').send({ name: 'report:export' }).expect(409);
    expect(response.body.error.code).toBe('ACTION_NAME_TAKEN');
  });

  it('lists the actions the seed created', async () => {
    const response = await api.get('/actions?pageSize=100').expect(200);

    const names = response.body.data.map((entry: { name: string }) => entry.name);
    expect(names).toContain('user:create');
    // Deliberately an action from this module's own always-present set: a
    // module's tests must not depend on whether an optional module was
    // installed, or deselecting one turns into a failure over here.
    expect(names).toContain('role:assign-action');
  });

  it('supports search and pagination', async () => {
    const response = await api.get('/actions?search=user&pageSize=2').expect(200);

    expect(response.body.data.length).toBeLessThanOrEqual(2);
    expect(response.body.meta.total).toBeGreaterThan(2);
  });
});
