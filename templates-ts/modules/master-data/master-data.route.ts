import { Router } from 'express';

import type { RouteGuards } from '../../core/middleware/auth.types.js';
import { validate } from '../../core/middleware/validate.js';
import { type ListQuery, listQuery } from '../../core/pagination.js';
import { paginationMeta, sendCreated, sendSuccess } from '../../core/response.js';

import {
  createMasterDataController,
  type MasterDataControllerDeps,
} from './master-data.controller.js';
import {
  type CreateItemBody,
  createItemBody,
  type CreateTypeBody,
  createTypeBody,
  itemCodeParams,
  type ItemListQuery,
  itemListQuery,
  typeCodeParam,
  type UpdateItemBody,
  updateItemBody,
  type UpdateTypeBody,
  updateTypeBody,
} from './master-data.schema.js';

/**
 * Route table for `/master-data`. See `master-data.controller` for the
 * logic behind each endpoint.
 *
 * Items are addressed by their type's code rather than its id — a client
 * fetching cities asks for `/master-data/types/CITY/items`, which it can
 * hardcode, instead of first looking up a UUID.
 *
 * All four permissions are `master-data:*`, deliberately coarse: reference
 * data is administered as one thing. If a project needs per-type control,
 * `authorize()` takes any string, so `master-data:CITY:update` works without
 * a change here.
 */
export interface MasterDataRouterDeps extends MasterDataControllerDeps, RouteGuards {}

export function createMasterDataRouter({
  authenticate,
  authorize,
  ...deps
}: MasterDataRouterDeps): Router {
  const router = Router();
  const controller = createMasterDataController(deps);

  // Reference data is often needed to populate public forms. If that applies,
  // move the read routes above this line and drop their `authorize` call.
  router.use(authenticate);

  // ------------------------------------------------------------- types
  router.get(
    '/types',
    validate({ query: listQuery }),
    authorize('master-data:read'),
    async (req, res) => {
      const query = req.validated.query as ListQuery;
      const { rows, total } = await controller.listTypes(query);

      sendSuccess(res, rows, { meta: paginationMeta(query.page, query.pageSize, total) });
    },
  );

  router.post(
    '/types',
    validate({ body: createTypeBody }),
    authorize('master-data:create'),
    async (req, res) => {
      sendCreated(res, await controller.createType(req.validated.body as CreateTypeBody));
    },
  );

  router.get(
    '/types/:code',
    validate({ params: typeCodeParam }),
    authorize('master-data:read'),
    async (req, res) => {
      const { code } = req.validated.params as { code: string };
      sendSuccess(res, await controller.getType(code));
    },
  );

  router.patch(
    '/types/:code',
    validate({ params: typeCodeParam, body: updateTypeBody }),
    authorize('master-data:update'),
    async (req, res) => {
      const { code } = req.validated.params as { code: string };
      sendSuccess(res, await controller.updateType(code, req.validated.body as UpdateTypeBody));
    },
  );

  router.delete(
    '/types/:code',
    validate({ params: typeCodeParam }),
    authorize('master-data:delete'),
    async (req, res) => {
      const { code } = req.validated.params as { code: string };
      await controller.deleteType(code);
      sendSuccess(res, { code, deleted: true });
    },
  );

  // ------------------------------------------------------------- items
  router.get(
    '/types/:code/items',
    validate({ params: typeCodeParam, query: itemListQuery }),
    authorize('master-data:read'),
    async (req, res) => {
      const { code } = req.validated.params as { code: string };
      const query = req.validated.query as ItemListQuery;
      const { rows, total } = await controller.listItems(code, query);

      sendSuccess(res, rows, { meta: paginationMeta(query.page, query.pageSize, total) });
    },
  );

  router.post(
    '/types/:code/items',
    validate({ params: typeCodeParam, body: createItemBody }),
    authorize('master-data:create'),
    async (req, res) => {
      const { code } = req.validated.params as { code: string };
      sendCreated(res, await controller.createItem(code, req.validated.body as CreateItemBody));
    },
  );

  router.get(
    '/types/:code/items/:itemCode',
    validate({ params: itemCodeParams }),
    authorize('master-data:read'),
    async (req, res) => {
      const { code, itemCode } = req.validated.params as { code: string; itemCode: string };
      sendSuccess(res, await controller.getItem(code, itemCode));
    },
  );

  router.patch(
    '/types/:code/items/:itemCode',
    validate({ params: itemCodeParams, body: updateItemBody }),
    authorize('master-data:update'),
    async (req, res) => {
      const { code, itemCode } = req.validated.params as { code: string; itemCode: string };
      sendSuccess(
        res,
        await controller.updateItem(code, itemCode, req.validated.body as UpdateItemBody),
      );
    },
  );

  router.delete(
    '/types/:code/items/:itemCode',
    validate({ params: itemCodeParams }),
    authorize('master-data:delete'),
    async (req, res) => {
      const { code, itemCode } = req.validated.params as { code: string; itemCode: string };
      await controller.deleteItem(code, itemCode);
      sendSuccess(res, { code: itemCode, deleted: true });
    },
  );

  return router;
}
