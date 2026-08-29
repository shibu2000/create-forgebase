import { Router } from 'express';

import type { RouteGuards } from '../../core/middleware/auth.types.js';
import { validate } from '../../core/middleware/validate.js';
import { listQuery, uuidParam } from '../../core/pagination.js';

import { createActionController } from './action.controller.js';
import { createActionBody, updateActionBody } from './action.schema.js';
import { type ActionServiceDeps, createActionService } from './action.service.js';

export interface ActionRouterDeps extends ActionServiceDeps, RouteGuards {}

export function createActionRouter({
  authenticate,
  authorize,
  ...serviceDeps
}: ActionRouterDeps): Router {
  const router = Router();
  const controller = createActionController(createActionService(serviceDeps));

  router.use(authenticate);

  router.get('/', validate({ query: listQuery }), authorize('action:read'), controller.list);

  router.post(
    '/',
    validate({ body: createActionBody }),
    authorize('action:create'),
    controller.create,
  );

  router.get('/:id', validate({ params: uuidParam }), authorize('action:read'), controller.getById);

  router.patch(
    '/:id',
    validate({ params: uuidParam, body: updateActionBody }),
    authorize('action:update'),
    controller.update,
  );

  router.delete(
    '/:id',
    validate({ params: uuidParam }),
    authorize('action:delete'),
    controller.remove,
  );

  return router;
}
