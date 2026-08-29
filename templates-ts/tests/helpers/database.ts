import { unitOfWork } from '../../src/db/connection.js';
import { actionRepository } from '../../src/db/repositories/action.repository.js';
import { roleRepository } from '../../src/db/repositories/role.repository.js';
import { userRepository } from '../../src/db/repositories/user.repository.js';
import { truncateAll } from '../../src/db/testing.js';
import { SEED_ACTIONS } from '../../src/seed.js';
import { passwordHasher } from '../../src/services/password/password.service.js';

/**
 * Database helpers for integration tests.
 *
 * Written against repositories rather than raw SQL so they work unchanged on
 * either ORM — the same reason the application code above them does.
 */

/** Cleared before each integration test so cases cannot leak into each other. */
export const TEST_TABLES = [
  'refresh_tokens',
  'password_reset_tokens',
  'user_roles',
  'role_actions',
  // forgebase:region:master-data start
  'master_data_items',
  'master_data_types',
  // forgebase:region:master-data end
  'users',
  'roles',
  'actions',
];

export async function resetDatabase(): Promise<void> {
  await truncateAll(TEST_TABLES);
}

export interface SeededAdmin {
  email: string;
  password: string;
  userId: string;
  roleId: string;
  actionIds: Record<string, string>;
}

/**
 * Creates every action, an admin role granting them, and an admin user.
 *
 * Mirrors `seed.ts`, but returns the ids so a test can grant a narrower
 * subset to a second user and check that authorization actually bites.
 */
export async function seedAdmin(
  email = 'admin@example.com',
  password = 'test-admin-password',
): Promise<SeededAdmin> {
  return unitOfWork.run(async (tx) => {
    const actions = actionRepository(tx);
    const roles = roleRepository(tx);
    const users = userRepository(tx);

    const actionIds: Record<string, string> = {};
    for (const definition of SEED_ACTIONS) {
      const existing = await actions.findByName(definition.name);
      const record = existing ?? (await actions.create(definition));
      actionIds[definition.name] = record.id;
    }

    const role = await roles.create({ name: 'admin', description: 'Test administrator' });
    await roles.setActions(role.id, Object.values(actionIds));

    const user = await users.create({
      email,
      passwordHash: await passwordHasher.hash(password),
      isActive: true,
    });
    await users.setRoles(user.id, [role.id]);

    return { email, password, userId: user.id, roleId: role.id, actionIds };
  });
}

/** Creates a user holding exactly the named actions — and nothing else. */
export async function seedUserWithActions(
  email: string,
  password: string,
  actionNames: string[],
): Promise<string> {
  return unitOfWork.run(async (tx) => {
    const actions = actionRepository(tx);
    const roles = roleRepository(tx);
    const users = userRepository(tx);

    const ids: string[] = [];
    for (const name of actionNames) {
      const existing = await actions.findByName(name);
      if (existing) ids.push(existing.id);
    }

    const role = await roles.create({ name: `role-${email}`, description: null });
    await roles.setActions(role.id, ids);

    const user = await users.create({
      email,
      passwordHash: await passwordHasher.hash(password),
      isActive: true,
    });
    await users.setRoles(user.id, [role.id]);

    return user.id;
  });
}
