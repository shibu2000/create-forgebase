import { Router } from 'express';

import type { RouteGuards } from '../../core/middleware/auth.types.js';
import { validate } from '../../core/middleware/validate.js';
import { type ListQuery, listQuery, uuidParam } from '../../core/pagination.js';
import { paginationMeta, sendCreated, sendSuccess } from '../../core/response.js';

import { createUserController, type UserControllerDeps } from './user.controller.js';
import {
  type CreateUserBody,
  createUserBody,
  type SetUserRolesBody,
  setUserRolesBody,
  type UpdateUserBody,
  updateUserBody,
} from './user.schema.js';

/**
 * Route table for `/users`.
 *
 * Each route reads: path, input validation, required permission, controller
 * call. The handler unpacks the request and picks a status code; every
 * decision lives in `user.controller`.
 *
 * `authenticate` and `authorize` are injected rather than imported, so this
 * module stays independent of how identity is established and tests can
 * exercise routing without minting tokens.
 */

export interface UserRouterDeps extends UserControllerDeps, RouteGuards {}

export function createUserRouter({ authenticate, authorize, ...deps }: UserRouterDeps): Router {
  const router = Router();
  const controller = createUserController(deps);

  // User administration is never public.
  router.use(authenticate);

  router.get('/', validate({ query: listQuery }), authorize('user:read'), async (req, res) => {
    const query = req.validated.query as ListQuery;
    const { rows, total } = await controller.list(query);

    sendSuccess(res, rows, { meta: paginationMeta(query.page, query.pageSize, total) });
  });

  router.post(
    '/',
    validate({ body: createUserBody }),
    authorize('user:create'),
    async (req, res) => {
      sendCreated(res, await controller.create(req.validated.body as CreateUserBody));
    },
  );

  router.get('/:id', validate({ params: uuidParam }), authorize('user:read'), async (req, res) => {
    const { id } = req.validated.params as { id: string };
    sendSuccess(res, await controller.getById(id));
  });

  router.patch(
    '/:id',
    validate({ params: uuidParam, body: updateUserBody }),
    authorize('user:update'),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      sendSuccess(res, await controller.update(id, req.validated.body as UpdateUserBody));
    },
  );

  router.delete(
    '/:id',
    validate({ params: uuidParam }),
    authorize('user:delete'),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      await controller.remove(id);

      // 200 with an envelope rather than a bare 204, so every response from
      // this API can be branched on with the same `success` field.
      sendSuccess(res, { id, deleted: true });
    },
  );

  // PUT, not POST: the payload replaces the user's assignments wholesale.
  router.put(
    '/:id/roles',
    validate({ params: uuidParam, body: setUserRolesBody }),
    authorize('user:assign-role'),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      sendSuccess(res, await controller.setRoles(id, req.validated.body as SetUserRolesBody));
    },
  );

  router.get(
    '/:id/actions',
    validate({ params: uuidParam }),
    authorize('user:read'),
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      const actions = await controller.getEffectiveActions(id);

      sendSuccess(res, { actions }, { meta: { count: actions.length } });
    },
  );

  return router;
}
