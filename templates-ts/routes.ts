import { Router } from 'express';

import { mountRouter } from './core/middleware/route-metadata.js';
import { unitOfWork } from './db/connection.js';
import { actionRepository } from './db/repositories/action.repository.js';
import {
  passwordResetTokenRepository,
  refreshTokenRepository,
} from './db/repositories/auth.repository.js';
// forgebase:region:master-data start
import {
  masterDataItemRepository,
  masterDataTypeRepository,
} from './db/repositories/master-data.repository.js';
// forgebase:region:master-data end
import { roleRepository } from './db/repositories/role.repository.js';
import { userRepository } from './db/repositories/user.repository.js';
import { createActionRouter } from './modules/action/action.route.js';
import { createAuthController } from './modules/auth/auth.controller.js';
import { createAuthGuards } from './modules/auth/auth.middleware.js';
import { createAuthRouter } from './modules/auth/auth.route.js';
// forgebase:region:master-data start
import { createMasterDataRouter } from './modules/master-data/master-data.route.js';
// forgebase:region:master-data end
import { createRoleRouter } from './modules/role/role.route.js';
import { createUserRouter } from './modules/user/user.route.js';
import { emailConfig } from './services/email/email.config.js';
import { createEmailService } from './services/email/nodemailer.provider.js';
import { passwordHasher } from './services/password/password.service.js';

/**
 * The composition root — where modules are handed their dependencies.
 *
 * Notably this file is *identical* for both ORMs. It imports repositories by
 * path, not by implementation, and `src/db` supplies whichever one was
 * installed. That it needed no ORM-specific variant is the clearest evidence
 * the repository seam actually holds.
 *
 * Each module router is mounted under its own base path, and declares its
 * routes relative to that. That is not only tidier: a module applies
 * `authenticate` with `router.use(...)`, which matches every path the router
 * sees — so a module mounted at `/` would answer 401 for requests that belong
 * to no module at all, and the 404 handler would never be reached.
 *
 * It is also where cross-module wiring happens: the user module is handed the
 * role repository as a `RoleLookup` and auth is handed the user repository as
 * an `AuthUserLookup`, both satisfied structurally. No module imports
 * another.
 */
export function createApiRouter(): Router {
  const router = Router();

  const email = createEmailService();

  // Built once and shared: the guards need the same controller the auth routes
  // expose, so a token minted by `/auth/login` is resolved by the very same
  // code path that `authenticate` uses.
  const authController = createAuthController({
    users: userRepository,
    refreshTokens: refreshTokenRepository,
    resetTokens: passwordResetTokenRepository,
    uow: unitOfWork,
    hasher: passwordHasher,
    email,
    appUrl: emailConfig.APP_URL,
  });

  const guards = createAuthGuards(authController);

  mountRouter(
    router,
    '/auth',
    createAuthRouter({
      users: userRepository,
      refreshTokens: refreshTokenRepository,
      resetTokens: passwordResetTokenRepository,
      uow: unitOfWork,
      hasher: passwordHasher,
      email,
      appUrl: emailConfig.APP_URL,
      authenticate: guards.authenticate,
    }),
  );

  mountRouter(
    router,
    '/users',
    createUserRouter({
      users: userRepository,
      roles: roleRepository,
      uow: unitOfWork,
      hasher: passwordHasher,
      ...guards,
    }),
  );

  mountRouter(
    router,
    '/roles',
    createRoleRouter({
      roles: roleRepository,
      actions: actionRepository,
      uow: unitOfWork,
      ...guards,
    }),
  );

  mountRouter(
    router,
    '/actions',
    createActionRouter({
      actions: actionRepository,
      ...guards,
    }),
  );

  // forgebase:region:master-data start
  mountRouter(
    router,
    '/master-data',
    createMasterDataRouter({
      types: masterDataTypeRepository,
      items: masterDataItemRepository,
      uow: unitOfWork,
      ...guards,
    }),
  );
  // forgebase:region:master-data end

  return router;
}
