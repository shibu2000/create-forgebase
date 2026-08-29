import { Router } from 'express';

import type { RouteGuards } from '../../core/middleware/auth.types.js';
import { validate } from '../../core/middleware/validate.js';
import { listQuery, uuidParam } from '../../core/pagination.js';

import { createUserController } from './user.controller.js';
import { createUserBody, setUserRolesBody, updateUserBody } from './user.schema.js';
import { createUserService, type UserServiceDeps } from './user.service.js';

/**
 * Route wiring. No logic here — each route is a middleware chain:
 * validate → authenticate → authorize → controller.
 *
 * `authenticate` and `authorize` are injected rather than imported, so this
 * module stays independent of how identity is established and tests can
 * exercise routing without minting tokens.
 */

export interface UserRouterDeps extends UserServiceDeps, RouteGuards {}

export function createUserRouter({
  authenticate,
  authorize,
  ...serviceDeps
}: UserRouterDeps): Router {
  const router = Router();
  const controller = createUserController(createUserService(serviceDeps));

  // User administration is never public.
  router.use(authenticate);

  router.get('/', validate({ query: listQuery }), authorize('user:read'), controller.list);

  router.post('/', validate({ body: createUserBody }), authorize('user:create'), controller.create);

  router.get('/:id', validate({ params: uuidParam }), authorize('user:read'), controller.getById);

  router.patch(
    '/:id',
    validate({ params: uuidParam, body: updateUserBody }),
    authorize('user:update'),
    controller.update,
  );

  router.delete(
    '/:id',
    validate({ params: uuidParam }),
    authorize('user:delete'),
    controller.remove,
  );

  // PUT, not POST: the payload replaces the user's assignments wholesale.
  router.put(
    '/:id/roles',
    validate({ params: uuidParam, body: setUserRolesBody }),
    authorize('user:assign-role'),
    controller.setRoles,
  );

  router.get(
    '/:id/actions',
    validate({ params: uuidParam }),
    authorize('user:read'),
    controller.getEffectiveActions,
  );

  return router;
}
