import { describe, expect, it, jest } from '@jest/globals';

import { UniqueViolationError } from '../../src/db/errors.js';
import type {
  RoleLookup,
  UserRepository,
} from '../../src/modules/user/user.repository.interface.js';
import { createUserService } from '../../src/modules/user/user.service.js';
import type { User } from '../../src/modules/user/user.types.js';
import { fakeHasher, fakeUnitOfWork, repoOf } from '../helpers/mocks.js';

/**
 * Unit tests: the service in isolation, with mocked repositories.
 *
 * These assert *decisions* — which error is raised, what gets called, in what
 * order. Whether a rollback actually rolls back is a question about Postgres,
 * so it belongs in the integration suite; asserting it against a fake would
 * only prove the fake behaves as written.
 */

const user: User = {
  id: 'user-1',
  email: 'ada@example.com',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildService(
  overrides: {
    users?: Partial<UserRepository>;
    roles?: Partial<RoleLookup>;
  } = {},
) {
  const users: Partial<UserRepository> = {
    create: jest.fn(async () => user),
    findById: jest.fn(async () => user),
    findWithRoles: jest.fn(async () => ({ ...user, roles: [] })),
    update: jest.fn(async () => user),
    delete: jest.fn(async () => true),
    setRoles: jest.fn(async () => undefined),
    findEffectiveActionNames: jest.fn(async () => ['user:read']),
    ...overrides.users,
  };

  const roles: Partial<RoleLookup> = {
    findExistingIds: jest.fn(async (ids: string[]) => ids),
    ...overrides.roles,
  };

  return {
    users,
    roles,
    service: createUserService({
      users: repoOf(users),
      roles: repoOf(roles),
      uow: fakeUnitOfWork,
      hasher: fakeHasher,
    }),
  };
}

describe('createUserService', () => {
  describe('create', () => {
    it('hashes the password before it reaches the repository', async () => {
      const { users, service } = buildService();

      await service.create({
        email: 'ada@example.com',
        password: 'a perfectly fine password',
        isActive: true,
      });

      expect(fakeHasher.hash).toHaveBeenCalledWith('a perfectly fine password');
      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: expect.stringContaining('$fake$') }),
      );
    });

    it('never passes the plaintext password to the repository', async () => {
      const { users, service } = buildService();

      await service.create({
        email: 'ada@example.com',
        password: 'a perfectly fine password',
        isActive: true,
      });

      const [input] = (users.create as jest.Mock).mock.calls[0] as [Record<string, unknown>];
      expect(JSON.stringify(input)).not.toContain('a perfectly fine password');
    });

    it('translates a unique violation into a 409', async () => {
      const { service } = buildService({
        users: {
          create: jest.fn(async () => {
            throw new UniqueViolationError('users_email_key');
          }),
        },
      });

      await expect(
        service.create({ email: 'ada@example.com', password: 'a password', isActive: true }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_TAKEN' });
    });

    it('rejects unknown role ids before creating anything', async () => {
      const { users, service } = buildService({
        roles: { findExistingIds: jest.fn(async () => []) },
      });

      await expect(
        service.create({
          email: 'ada@example.com',
          password: 'a password',
          isActive: true,
          roleIds: ['missing-role'],
        }),
      ).rejects.toMatchObject({ statusCode: 422, code: 'UNKNOWN_ROLES' });

      // The check has to happen first, or a failed assignment leaves an
      // orphaned user behind.
      expect(users.create).not.toHaveBeenCalled();
    });

    it('reports exactly which role ids were unknown', async () => {
      const { service } = buildService({
        roles: { findExistingIds: jest.fn(async () => ['known']) },
      });

      await expect(
        service.create({
          email: 'ada@example.com',
          password: 'a password',
          isActive: true,
          roleIds: ['known', 'missing-a', 'missing-b'],
        }),
      ).rejects.toMatchObject({ details: { roleIds: ['missing-a', 'missing-b'] } });
    });
  });

  describe('update', () => {
    it('only hashes a password when one was supplied', async () => {
      const { service } = buildService();

      await service.update('user-1', { email: 'new@example.com' });
      expect(fakeHasher.hash).not.toHaveBeenCalled();
    });

    it('raises 404 when the row does not exist', async () => {
      const { service } = buildService({ users: { update: jest.fn(async () => null) } });

      await expect(service.update('missing', { isActive: false })).rejects.toMatchObject({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
      });
    });
  });

  describe('getEffectiveActions', () => {
    it('raises 404 rather than returning an empty list for an unknown user', async () => {
      const { service } = buildService({ users: { findById: jest.fn(async () => null) } });

      await expect(service.getEffectiveActions('missing')).rejects.toMatchObject({
        code: 'USER_NOT_FOUND',
      });
    });
  });
});
