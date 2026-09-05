import { Router } from 'express';

import type { RouteGuards } from '../../core/middleware/auth.types.js';
import { validate } from '../../core/middleware/validate.js';
import { type ListQuery, listQuery, uuidParam } from '../../core/pagination.js';
import { paginationMeta, sendCreated, sendSuccess } from '../../core/response.js';

import { createRoleController, type RoleControllerDeps } from './role.controller.js';
import {
  type CreateRoleBody,
  createRoleBody,
  type SetRoleActionsBody,
  setRoleActionsBody,
  type UpdateRoleBody,
  updateRoleBody,
} from './role.schema.js';

/**
 * Route table for `/roles`.
 *
 * Read a route left to right: path, input validation, required permission,
 * then the controller call. The handler only unpacks the request and picks a
 * status code — every decision lives in `role.controller`, which is the
 * one file to open to understand what an endpoint does.
 *
 * Handlers throw rather than catch. Express 5 forwards a rejected promise to
 * the central error middleware, which owns the error envelope.
 */

export interface RoleRouterDeps extends RoleControllerDeps, RouteGuards {}

export function createRoleRouter({ authenticate, authorize, ...deps }: RoleRouterDeps): Router {
  const router = Router();
  const controller = createRoleController(deps);

  router.use(authenticate);

  router.get('/', validate({ query: listQuery }), authorize('role:read'), async (req, res) => {
    const query = req.validated.query as ListQuery;
    const { rows, total } = await controller.list(query);

    sendSuccess(res, rows, { meta: paginationMeta(query.page, query.pageSize, total) });
  });

  router.post(
    '/',
    validate({ body: createRoleBody }),
    authorize('role:create'),
    async (req, res) => {
      sendCreated(res, await controller.create(req.validated.body as CreateRoleBody));
    },
  );

  router.get('/:id', validate({ params: uuidParam }), authorize('role:read'), async (req, res) => {
    const { id } = req.validated.params as { id: string };
    sendSuccess(res, await controller.getById(id));
  });

  router.patch(
    '/:id',
    validate({ params: uuidParam, body: updateRoleBody }),
    authorize('role:update'),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      sendSuccess(res, await controller.update(id, req.validated.body as UpdateRoleBody));
    },
  );

  router.delete(
    '/:id',
    validate({ params: uuidParam }),
    authorize('role:delete'),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      await controller.remove(id);

      // 200 with an envelope rather than a bare 204, so every response from
      // this API can be branched on with the same `success` field.
      sendSuccess(res, { id, deleted: true });
    },
  );

  router.get(
    '/:id/actions',
    validate({ params: uuidParam }),
    authorize('role:read'),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      const actions = await controller.getActions(id);

      sendSuccess(res, actions, { meta: { count: actions.length } });
    },
  );

  // PUT, not POST: the payload replaces the role's grants wholesale.
  router.put(
    '/:id/actions',
    validate({ params: uuidParam, body: setRoleActionsBody }),
    authorize('role:assign-action'),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      const actions = await controller.setActions(id, req.validated.body as SetRoleActionsBody);

      sendSuccess(res, actions, { meta: { count: actions.length } });
    },
  );

  return router;
}
