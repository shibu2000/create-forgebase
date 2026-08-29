import { z } from 'zod';

import { defineEnv } from './core/env.js';
import { createLogger } from './core/logger.js';
import { closeDatabase, unitOfWork } from './db/connection.js';
import { actionRepository } from './db/repositories/action.repository.js';
import { roleRepository } from './db/repositories/role.repository.js';
import { userRepository } from './db/repositories/user.repository.js';
import { passwordHasher } from './services/password/password.service.js';

/**
 * Bootstraps the permission model and the first administrator.
 *
 * Every route is gated by an action, and actions live in the database — so a
 * freshly migrated project has no way to authenticate anybody and no way to
 * create the account that could. This closes that loop.
 *
 * Idempotent by design: safe to run on every deploy, which is what keeps
 * newly added actions from requiring a manual insert in production.
 */

const log = createLogger('seed');

const seedConfig = defineEnv(
  z.object({
    ADMIN_EMAIL: z.email().default('admin@example.com'),
    ADMIN_PASSWORD: z
      .string()
      .min(12, 'Must be at least 12 characters')
      .default('change-me-immediately'),
    ADMIN_ROLE_NAME: z.string().default('admin'),
  }),
);

/**
 * The permissions the scaffolded routes check for.
 *
 * Keep this in step with the `authorize(...)` calls in each module's route
 * file — a route naming an action that does not exist here can never be
 * granted to anyone.
 */
export const SEED_ACTIONS: { name: string; description: string }[] = [
  { name: 'user:read', description: 'View users' },
  { name: 'user:create', description: 'Create users' },
  { name: 'user:update', description: 'Modify users' },
  { name: 'user:delete', description: 'Delete users' },
  { name: 'user:assign-role', description: "Change a user's roles" },
  { name: 'role:read', description: 'View roles' },
  { name: 'role:create', description: 'Create roles' },
  { name: 'role:update', description: 'Modify roles' },
  { name: 'role:delete', description: 'Delete roles' },
  { name: 'role:assign-action', description: 'Change the actions a role grants' },
  { name: 'action:read', description: 'View actions' },
  { name: 'action:create', description: 'Create actions' },
  { name: 'action:update', description: 'Modify actions' },
  { name: 'action:delete', description: 'Delete actions' },
  // forgebase:region:master-data start
  { name: 'master-data:read', description: 'View reference data' },
  { name: 'master-data:create', description: 'Create reference data' },
  { name: 'master-data:update', description: 'Modify reference data' },
  { name: 'master-data:delete', description: 'Delete reference data' },
  // forgebase:region:master-data end
  // forgebase:seed-actions — scaffolded modules add their permissions here
];

export async function seed(): Promise<void> {
  await unitOfWork.run(async (tx) => {
    const actions = actionRepository(tx);
    const roles = roleRepository(tx);
    const users = userRepository(tx);

    // Actions first — the role grants them.
    const actionIds: string[] = [];
    for (const definition of SEED_ACTIONS) {
      const existing = await actions.findByName(definition.name);
      const record = existing ?? (await actions.create(definition));
      actionIds.push(record.id);
    }

    const roleName = seedConfig.ADMIN_ROLE_NAME;
    const existingRole = await roles.findByName(roleName);
    const role =
      existingRole ??
      (await roles.create({ name: roleName, description: 'Full administrative access' }));

    // Re-granting every action on each run is what makes newly added
    // permissions reach the admin role without a manual step.
    await roles.setActions(role.id, actionIds);

    const email = seedConfig.ADMIN_EMAIL.toLowerCase();
    const existingUser = await users.findByEmail(email);

    if (existingUser) {
      // Never touch an existing account's password — a re-run must not reset
      // a credential someone has already changed.
      await users.setRoles(existingUser.id, [role.id]);
      log.info({ email, role: roleName }, 'Admin account already present; roles reconciled');
      return;
    }

    const created = await users.create({
      email,
      passwordHash: await passwordHasher.hash(seedConfig.ADMIN_PASSWORD),
      isActive: true,
    });

    await users.setRoles(created.id, [role.id]);
    log.warn(
      { email, role: roleName },
      'Admin account created — sign in and change this password immediately',
    );
  });

  log.info({ actions: SEED_ACTIONS.length }, 'Seed complete');
}

// Only self-execute when invoked directly, so tests can import `seed`.
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  try {
    await seed();
    await closeDatabase();
    process.exit(0);
  } catch (error) {
    log.fatal({ err: error }, 'Seed failed');
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  }
}
