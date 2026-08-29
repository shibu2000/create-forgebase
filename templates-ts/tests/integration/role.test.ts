import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import type TestAgent from 'supertest/lib/agent.js';

import { closeDatabase } from '../../src/db/connection.js';
import { asUser, buildTestApp, login } from '../helpers/app.js';
import { resetDatabase, seedAdmin } from '../helpers/database.js';

/** Integration tests for the role module. */

let agent: TestAgent;
let admin: Awaited<ReturnType<typeof seedAdmin>>;
let api: ReturnType<typeof asUser>;

beforeEach(async () => {
  await resetDatabase();
  admin = await seedAdmin();
  agent = buildTestApp();
  api = asUser(agent, await login(agent, admin.email, admin.password));
});

afterAll(async () => {
  await closeDatabase();
});

describe('role CRUD', () => {
  it('creates a role', async () => {
    const response = await api
      .post('/roles')
      .send({ name: 'editor', description: 'Can edit things' })
      .expect(201);

    expect(response.body.data.name).toBe('editor');
  });

  it('rejects a duplicate name with 409', async () => {
    await api.post('/roles').send({ name: 'editor' }).expect(201);

    const response = await api.post('/roles').send({ name: 'editor' }).expect(409);
    expect(response.body.error.code).toBe('ROLE_NAME_TAKEN');
  });

  it('returns 404 for an unknown role', async () => {
    const response = await api.get('/roles/00000000-0000-4000-8000-000000000000').expect(404);
    expect(response.body.error.code).toBe('ROLE_NOT_FOUND');
  });
});

describe('PUT /roles/:id/actions', () => {
  it('replaces the granted actions wholesale', async () => {
    const role = await api.post('/roles').send({ name: 'editor' }).expect(201);

    await api
      .put(`/roles/${role.body.data.id}/actions`)
      .send({ actionIds: [admin.actionIds['user:read'], admin.actionIds['user:create']] })
      .expect(200);

    const replaced = await api
      .put(`/roles/${role.body.data.id}/actions`)
      .send({ actionIds: [admin.actionIds['user:read']] })
      .expect(200);

    expect(replaced.body.data).toHaveLength(1);
  });

  it('leaves existing grants intact when an assignment is rejected', async () => {
    const role = await api.post('/roles').send({ name: 'editor' }).expect(201);

    await api
      .put(`/roles/${role.body.data.id}/actions`)
      .send({ actionIds: [admin.actionIds['user:read'], admin.actionIds['user:create']] })
      .expect(200);

    await api
      .put(`/roles/${role.body.data.id}/actions`)
      .send({ actionIds: ['00000000-0000-4000-8000-000000000000'] })
      .expect(422);

    const actions = await api.get(`/roles/${role.body.data.id}/actions`).expect(200);
    expect(actions.body.data).toHaveLength(2);
  });
});

describe('deleting a role', () => {
  it('cascades to the users that held it', async () => {
    const role = await api.post('/roles').send({ name: 'temp' }).expect(201);
    await api
      .put(`/roles/${role.body.data.id}/actions`)
      .send({ actionIds: [admin.actionIds['user:read']] });

    const user = await api
      .post('/users')
      .send({
        email: 'temp@example.com',
        password: 'a perfectly fine password',
        roleIds: [role.body.data.id],
      })
      .expect(201);

    await api.delete(`/roles/${role.body.data.id}`).expect(200);

    const after = await api.get(`/users/${user.body.data.id}`).expect(200);
    expect(after.body.data.roles).toHaveLength(0);

    const actions = await api.get(`/users/${user.body.data.id}/actions`).expect(200);
    expect(actions.body.data.actions).toEqual([]);
  });
});
