import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import type TestAgent from 'supertest/lib/agent.js';

import { closeDatabase } from '../../src/db/connection.js';
import { buildTestApp, login } from '../helpers/app.js';
import { resetDatabase, seedAdmin } from '../helpers/database.js';

/**
 * Integration tests: real HTTP, real middleware chain, real Postgres.
 *
 * These cover what unit tests structurally cannot — that a transaction
 * actually rolls back, that a unique index actually fires, that the guards
 * are actually wired into the routes.
 */

let agent: TestAgent;
let admin: Awaited<ReturnType<typeof seedAdmin>>;

beforeEach(async () => {
  await resetDatabase();
  admin = await seedAdmin();
  agent = buildTestApp();
});

afterAll(async () => {
  await closeDatabase();
});

describe('POST /auth/login', () => {
  it('issues an access and refresh token pair', async () => {
    const response = await agent
      .post('/auth/login')
      .send({ email: admin.email, password: admin.password })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.accessToken.split('.')).toHaveLength(3);
    expect(response.body.data.refreshToken.length).toBeGreaterThan(20);
    expect(response.body.data.tokenType).toBe('Bearer');
  });

  it('never returns a password hash', async () => {
    const response = await agent
      .post('/auth/login')
      .send({ email: admin.email, password: admin.password });

    expect(JSON.stringify(response.body)).not.toContain('$argon2');
  });

  it('rejects a wrong password', async () => {
    const response = await agent
      .post('/auth/login')
      .send({ email: admin.email, password: 'wrong-password' })
      .expect(401);

    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('answers an unknown address identically to a wrong password', async () => {
    const unknown = await agent
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong-password' })
      .expect(401);

    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('refresh token rotation', () => {
  it('rotates the token on every refresh', async () => {
    const first = await agent
      .post('/auth/login')
      .send({ email: admin.email, password: admin.password });

    const rotated = await agent
      .post('/auth/refresh')
      .send({ refreshToken: first.body.data.refreshToken })
      .expect(200);

    expect(rotated.body.data.refreshToken).not.toBe(first.body.data.refreshToken);
  });

  it('revokes every session when a rotated token is replayed', async () => {
    const first = await agent
      .post('/auth/login')
      .send({ email: admin.email, password: admin.password });

    const rotated = await agent
      .post('/auth/refresh')
      .send({ refreshToken: first.body.data.refreshToken });

    // Replaying the old token means it leaked or was replayed; either way
    // every live session for that user has to die.
    await agent
      .post('/auth/refresh')
      .send({ refreshToken: first.body.data.refreshToken })
      .expect(401);

    // The revocation has to survive the request that rejected the caller —
    // it is committed outside the transaction that throws.
    await agent
      .post('/auth/refresh')
      .send({ refreshToken: rotated.body.data.refreshToken })
      .expect(401);
  });
});

describe('POST /auth/logout', () => {
  it('revokes the refresh token server-side', async () => {
    const session = await agent
      .post('/auth/login')
      .send({ email: admin.email, password: admin.password });

    await agent
      .post('/auth/logout')
      .send({ refreshToken: session.body.data.refreshToken })
      .expect(200);

    await agent
      .post('/auth/refresh')
      .send({ refreshToken: session.body.data.refreshToken })
      .expect(401);
  });
});

describe('authenticate', () => {
  it('rejects a request with no token', async () => {
    const response = await agent.get('/users').expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a forged signature', async () => {
    const token = await login(agent, admin.email, admin.password);
    const [header, payload] = token.split('.');

    await agent
      .get('/users')
      .set('Authorization', `Bearer ${header}.${payload}.forgedsignature`)
      .expect(401);
  });

  it('attaches the caller and their effective permissions', async () => {
    const token = await login(agent, admin.email, admin.password);

    const response = await agent
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.email).toBe(admin.email);
    expect(response.body.data.actions).toContain('user:create');
  });
});
