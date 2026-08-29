import { Router } from 'express';

import type { RouteGuards } from '../../core/middleware/auth.types.js';
import { validate } from '../../core/middleware/validate.js';
import { listQuery, uuidParam } from '../../core/pagination.js';

import { createRoleController } from './role.controller.js';
import { createRoleBody, setRoleActionsBody, updateRoleBody } from './role.schema.js';
import { createRoleService, type RoleServiceDeps } from './role.service.js';

export interface RoleRouterDeps extends RoleServiceDeps, RouteGuards {}

export function createRoleRouter({
  authenticate,
  authorize,
  ...serviceDeps
}: RoleRouterDeps): Router {
  const router = Router();
  const controller = createRoleController(createRoleService(serviceDeps));

  router.use(authenticate);

  router.get('/', validate({ query: listQuery }), authorize('role:read'), controller.list);

  router.post('/', validate({ body: createRoleBody }), authorize('role:create'), controller.create);

  router.get('/:id', validate({ params: uuidParam }), authorize('role:read'), controller.getById);

  router.patch(
    '/:id',
    validate({ params: uuidParam, body: updateRoleBody }),
    authorize('role:update'),
    controller.update,
  );

  router.delete(
    '/:id',
    validate({ params: uuidParam }),
    authorize('role:delete'),
    controller.remove,
  );

  router.get(
    '/:id/actions',
    validate({ params: uuidParam }),
    authorize('role:read'),
    controller.getActions,
  );

  // PUT, not POST: the payload replaces the role's grants wholesale.
  router.put(
    '/:id/actions',
    validate({ params: uuidParam, body: setRoleActionsBody }),
    authorize('role:assign-action'),
    controller.setActions,
  );

  return router;
}
