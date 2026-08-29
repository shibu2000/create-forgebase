import { afterAll, beforeEach, describe, expect, it } from '@jest/globals';
import type TestAgent from 'supertest/lib/agent.js';

import { closeDatabase } from '../../src/db/connection.js';
import { asUser, buildTestApp, login } from '../helpers/app.js';
import { resetDatabase, seedAdmin } from '../helpers/database.js';

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

describe('the generic type/item pattern', () => {
  it('gives a brand-new kind of reference data a working CRUD surface', async () => {
    // No migration, no new table, no new endpoint — just a row.
    await api
      .post('/master-data/types')
      .send({ code: 'TOUR_TYPE', name: 'Tour types' })
      .expect(201);

    await api
      .post('/master-data/types/TOUR_TYPE/items')
      .send({ code: 'WALKING', label: 'Walking tour' })
      .expect(201);

    const listed = await api.get('/master-data/types/TOUR_TYPE/items').expect(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].label).toBe('Walking tour');
  });

  it('scopes item codes to their type', async () => {
    await api.post('/master-data/types').send({ code: 'CITY', name: 'Cities' }).expect(201);
    await api.post('/master-data/types').send({ code: 'PORT', name: 'Ports' }).expect(201);

    await api
      .post('/master-data/types/CITY/items')
      .send({ code: 'LON', label: 'London' })
      .expect(201);

    // The same code under a different type is fine...
    await api
      .post('/master-data/types/PORT/items')
      .send({ code: 'LON', label: 'Port of London' })
      .expect(201);

    // ...but a duplicate within one type is not.
    const duplicate = await api
      .post('/master-data/types/CITY/items')
      .send({ code: 'LON', label: 'Duplicate' })
      .expect(409);

    expect(duplicate.body.error.code).toBe('MASTER_DATA_ITEM_CODE_TAKEN');
  });

  it('round-trips jsonb metadata', async () => {
    await api.post('/master-data/types').send({ code: 'CITY', name: 'Cities' }).expect(201);

    const created = await api
      .post('/master-data/types/CITY/items')
      .send({ code: 'LON', label: 'London', meta: { lat: 51.5072, tz: 'Europe/London' } })
      .expect(201);

    expect(created.body.data.meta).toEqual({ lat: 51.5072, tz: 'Europe/London' });
  });

  it('orders items by sortOrder, not insertion or alphabet', async () => {
    await api.post('/master-data/types').send({ code: 'CITY', name: 'Cities' }).expect(201);

    await api
      .post('/master-data/types/CITY/items')
      .send({ code: 'ZUR', label: 'Zurich', sortOrder: 1 });
    await api
      .post('/master-data/types/CITY/items')
      .send({ code: 'AMS', label: 'Amsterdam', sortOrder: 2 });

    const listed = await api.get('/master-data/types/CITY/items').expect(200);
    expect(listed.body.data.map((item: { code: string }) => item.code)).toEqual(['ZUR', 'AMS']);
  });

  it('filters out inactive items when asked', async () => {
    await api.post('/master-data/types').send({ code: 'CITY', name: 'Cities' }).expect(201);
    await api.post('/master-data/types/CITY/items').send({ code: 'LON', label: 'London' });
    await api
      .post('/master-data/types/CITY/items')
      .send({ code: 'OLD', label: 'Retired', isActive: false });

    const all = await api.get('/master-data/types/CITY/items').expect(200);
    const active = await api.get('/master-data/types/CITY/items?activeOnly=true').expect(200);

    expect(all.body.data).toHaveLength(2);
    expect(active.body.data).toHaveLength(1);
  });
});

describe('deletion guard', () => {
  it('refuses to delete a type that still holds items', async () => {
    await api.post('/master-data/types').send({ code: 'CITY', name: 'Cities' }).expect(201);
    await api.post('/master-data/types/CITY/items').send({ code: 'LON', label: 'London' });

    const refused = await api.delete('/master-data/types/CITY').expect(409);
    expect(refused.body.error.code).toBe('MASTER_DATA_TYPE_IN_USE');
    expect(refused.body.error.details.itemCount).toBe(1);

    // The FK cascades, so without the guard those items would be gone.
    await api.get('/master-data/types/CITY').expect(200);
  });

  it('allows deleting an emptied type', async () => {
    await api.post('/master-data/types').send({ code: 'CITY', name: 'Cities' }).expect(201);
    await api.post('/master-data/types/CITY/items').send({ code: 'LON', label: 'London' });

    await api.delete('/master-data/types/CITY/items/LON').expect(200);
    await api.delete('/master-data/types/CITY').expect(200);
    await api.get('/master-data/types/CITY').expect(404);
  });
});
