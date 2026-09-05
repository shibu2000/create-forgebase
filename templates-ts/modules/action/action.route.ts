import { Router } from 'express';

import type { RouteGuards } from '../../core/middleware/auth.types.js';
import { validate } from '../../core/middleware/validate.js';
import { type ListQuery, listQuery, uuidParam } from '../../core/pagination.js';
import { paginationMeta, sendCreated, sendSuccess } from '../../core/response.js';

import { type ActionControllerDeps, createActionController } from './action.controller.js';
import {
  type CreateActionBody,
  createActionBody,
  type UpdateActionBody,
  updateActionBody,
} from './action.schema.js';

/**
 * Route table for `/actions`.
 *
 * Path, validation, permission, controller call — see `action.controller`
 * for what each endpoint actually does.
 */

export interface ActionRouterDeps extends ActionControllerDeps, RouteGuards {}

export function createActionRouter({ authenticate, authorize, ...deps }: ActionRouterDeps): Router {
  const router = Router();
  const controller = createActionController(deps);

  router.use(authenticate);

  router.get('/', validate({ query: listQuery }), authorize('action:read'), async (req, res) => {
    const query = req.validated.query as ListQuery;
    const { rows, total } = await controller.list(query);

    sendSuccess(res, rows, { meta: paginationMeta(query.page, query.pageSize, total) });
  });

  router.post(
    '/',
    validate({ body: createActionBody }),
    authorize('action:create'),
    async (req, res) => {
      sendCreated(res, await controller.create(req.validated.body as CreateActionBody));
    },
  );

  router.get(
    '/:id',
    validate({ params: uuidParam }),
    authorize('action:read'),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      sendSuccess(res, await controller.getById(id));
    },
  );

  router.patch(
    '/:id',
    validate({ params: uuidParam, body: updateActionBody }),
    authorize('action:update'),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      sendSuccess(res, await controller.update(id, req.validated.body as UpdateActionBody));
    },
  );

  router.delete(
    '/:id',
    validate({ params: uuidParam }),
    authorize('action:delete'),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      await controller.remove(id);
      sendSuccess(res, { id, deleted: true });
    },
  );

  return router;
}
