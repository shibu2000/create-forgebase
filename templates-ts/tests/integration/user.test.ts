import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import type TestAgent from 'supertest/lib/agent.js';

import { closeDatabase } from '../../src/db/connection.js';
import { asUser, buildTestApp, login } from '../helpers/app.js';
import { resetDatabase, seedAdmin, seedUserWithActions } from '../helpers/database.js';

/**
 * Integration tests for the user module: real HTTP, real middleware chain,
 * real PostgreSQL.
 *
 * These cover what a mocked repository structurally cannot — that a rollback
 * really rolls back and a unique index really fires.
 */

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

describe('POST /users', () => {
  it('creates a user and returns it without any secret', async () => {
    const response = await api
      .post('/users')
      .send({ email: 'ada@example.com', password: 'a perfectly fine password' })
      .expect(201);

    expect(response.body.data.email).toBe('ada@example.com');
    expect(JSON.stringify(response.body)).not.toContain('$argon2');
    expect(JSON.stringify(response.body)).not.toContain('a perfectly fine password');
  });

  it('normalises email case before storing', async () => {
    const response = await api
      .post('/users')
      .send({ email: 'MiXeD@Example.COM', password: 'a perfectly fine password' })
      .expect(201);

    expect(response.body.data.email).toBe('mixed@example.com');
  });

  it('rejects a duplicate email with 409, enforced by the unique index', async () => {
    await api
      .post('/users')
      .send({ email: 'dupe@example.com', password: 'a perfectly fine password' })
      .expect(201);

    const response = await api
      .post('/users')
      .send({ email: 'dupe@example.com', password: 'a perfectly fine password' })
      .expect(409);

    expect(response.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('persists nothing when role assignment fails mid-create', async () => {
    const response = await api
      .post('/users')
      .send({
        email: 'rollback@example.com',
        password: 'a perfectly fine password',
        roleIds: ['00000000-0000-4000-8000-000000000000'],
      })
      .expect(422);

    expect(response.body.error.code).toBe('UNKNOWN_ROLES');

    // The real assertion: no orphaned user row survived the failure.
    const listed = await api.get('/users?search=rollback').expect(200);
    expect(listed.body.data).toHaveLength(0);
  });
});

describe('GET /users/:id/actions', () => {
  it('resolves the deduplicated union across every assigned role', async () => {
    const reader = await api.post('/roles').send({ name: 'reader' }).expect(201);
    const writer = await api.post('/roles').send({ name: 'writer' }).expect(201);

    // Both grant user:read; only one grants user:create.
    await api
      .put(`/roles/${reader.body.data.id}/actions`)
      .send({ actionIds: [admin.actionIds['user:read']] });
    await api
      .put(`/roles/${writer.body.data.id}/actions`)
      .send({ actionIds: [admin.actionIds['user:read'], admin.actionIds['user:create']] });

    const created = await api
      .post('/users')
      .send({
        email: 'multi@example.com',
        password: 'a perfectly fine password',
        roleIds: [reader.body.data.id, writer.body.data.id],
      })
      .expect(201);

    const response = await api.get(`/users/${created.body.data.id}/actions`).expect(200);
    expect(response.body.data.actions).toEqual(['user:create', 'user:read']);
  });
});

describe('validation and authorization', () => {
  it('rejects a malformed id before the service runs', async () => {
    const response = await api.get('/users/not-a-uuid').expect(422);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details[0].path).toBe('params.id');
  });

  it('caps page size', async () => {
    await api.get('/users?pageSize=5000').expect(422);
  });

  it('permits a granted action and refuses an ungranted one', async () => {
    await seedUserWithActions('limited@example.com', 'a perfectly fine password', ['user:read']);
    const limited = asUser(
      agent,
      await login(agent, 'limited@example.com', 'a perfectly fine password'),
    );

    await limited.get('/users').expect(200);

    const denied = await limited
      .post('/users')
      .send({ email: 'nope@example.com', password: 'a perfectly fine password' })
      .expect(403);

    expect(denied.body.error.code).toBe('FORBIDDEN');
    expect(denied.body.error.message).toContain('user:create');
  });
});
