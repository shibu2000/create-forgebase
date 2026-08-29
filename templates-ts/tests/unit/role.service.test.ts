import { describe, expect, it, jest } from '@jest/globals';

import { UniqueViolationError } from '../../src/db/errors.js';
import type {
  ActionLookup,
  RoleRepository,
} from '../../src/modules/role/role.repository.interface.js';
import { createRoleService } from '../../src/modules/role/role.service.js';
import type { Role } from '../../src/modules/role/role.types.js';
import { fakeUnitOfWork, repoOf } from '../helpers/mocks.js';

const role: Role = { id: 'role-1', name: 'admin', description: null };

function buildService(
  overrides: {
    roles?: Partial<RoleRepository>;
    actions?: Partial<ActionLookup>;
  } = {},
) {
  const roles: Partial<RoleRepository> = {
    findById: jest.fn(async () => role),
    create: jest.fn(async () => role),
    update: jest.fn(async () => role),
    delete: jest.fn(async () => true),
    findActions: jest.fn(async () => []),
    setActions: jest.fn(async () => undefined),
    ...overrides.roles,
  };

  const actions: Partial<ActionLookup> = {
    findExistingIds: jest.fn(async (ids: string[]) => ids),
    ...overrides.actions,
  };

  return {
    roles,
    actions,
    service: createRoleService({
      roles: repoOf(roles),
      actions: repoOf(actions),
      uow: fakeUnitOfWork,
    }),
  };
}

describe('createRoleService', () => {
  it('translates a unique violation into a 409', async () => {
    const { service } = buildService({
      roles: {
        create: jest.fn(async () => {
          throw new UniqueViolationError('roles_name_key');
        }),
      },
    });

    await expect(service.create({ name: 'admin', description: null })).rejects.toMatchObject({
      statusCode: 409,
      code: 'ROLE_NAME_TAKEN',
    });
  });

  it('rejects unknown action ids without touching the grants', async () => {
    const { roles, service } = buildService({
      actions: { findExistingIds: jest.fn(async () => []) },
    });

    await expect(service.setActions('role-1', { actionIds: ['missing'] })).rejects.toMatchObject({
      statusCode: 422,
      code: 'UNKNOWN_ACTIONS',
    });

    expect(roles.setActions).not.toHaveBeenCalled();
  });

  it('raises 404 when granting actions to a role that does not exist', async () => {
    const { service } = buildService({ roles: { findById: jest.fn(async () => null) } });

    await expect(service.setActions('missing', { actionIds: [] })).rejects.toMatchObject({
      code: 'ROLE_NOT_FOUND',
    });
  });
});
