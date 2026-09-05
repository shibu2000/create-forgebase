import { describe, expect, it, jest } from '@jest/globals';

import { UniqueViolationError } from '../../src/db/errors.js';
import { createActionController } from '../../src/modules/action/action.controller.js';
import type { ActionRepository } from '../../src/modules/action/action.repository.interface.js';
import type { Action } from '../../src/modules/action/action.types.js';
import { repoOf } from '../helpers/mocks.js';

/**
 * Unit tests for the action controller, with a mocked repository.
 *
 * Actions are the permission vocabulary every `authorize()` call checks
 * against, so the rules about naming and uniqueness are worth pinning down.
 */

const action: Action = { id: 'action-1', name: 'user:read', description: null };

function buildController(overrides: Partial<ActionRepository> = {}) {
  const actions: Partial<ActionRepository> = {
    list: jest.fn(async () => ({ rows: [action], total: 1 })),
    findById: jest.fn(async () => action),
    findByName: jest.fn(async () => action),
    findExistingIds: jest.fn(async (ids: string[]) => ids),
    create: jest.fn(async () => action),
    update: jest.fn(async () => action),
    delete: jest.fn(async () => true),
    ...overrides,
  };

  return { actions, controller: createActionController({ actions: repoOf(actions) }) };
}

describe('createActionController', () => {
  it('translates a unique violation into a 409', async () => {
    const { controller } = buildController({
      create: jest.fn(async () => {
        throw new UniqueViolationError('actions_name_key');
      }),
    });

    await expect(controller.create({ name: 'user:read', description: null })).rejects.toMatchObject(
      {
        statusCode: 409,
        code: 'ACTION_NAME_TAKEN',
      },
    );
  });

  it('raises 404 for an unknown id rather than returning null', async () => {
    const { controller } = buildController({ findById: jest.fn(async () => null) });

    await expect(controller.getById('missing')).rejects.toMatchObject({
      statusCode: 404,
      code: 'ACTION_NOT_FOUND',
    });
  });

  it('raises 404 when deleting something that is not there', async () => {
    const { controller } = buildController({ delete: jest.fn(async () => false) });

    await expect(controller.remove('missing')).rejects.toMatchObject({
      code: 'ACTION_NOT_FOUND',
    });
  });

  it('normalises a missing description to null rather than undefined', async () => {
    const { actions, controller } = buildController();

    await controller.create({ name: 'user:read' });

    expect(actions.create).toHaveBeenCalledWith({ name: 'user:read', description: null });
  });
});
