import { Router } from 'express';

import type { RouteGuards } from '../../core/middleware/auth.types.js';
import { validate } from '../../core/middleware/validate.js';
import { listQuery } from '../../core/pagination.js';

import { createMasterDataController } from './master-data.controller.js';
import {
  createItemBody,
  createTypeBody,
  itemCodeParams,
  itemListQuery,
  typeCodeParam,
  updateItemBody,
  updateTypeBody,
} from './master-data.schema.js';
import { createMasterDataService, type MasterDataServiceDeps } from './master-data.service.js';

/**
 * Reference-data routes.
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
export interface MasterDataRouterDeps extends MasterDataServiceDeps, RouteGuards {}

export function createMasterDataRouter({
  authenticate,
  authorize,
  ...serviceDeps
}: MasterDataRouterDeps): Router {
  const router = Router();
  const controller = createMasterDataController(createMasterDataService(serviceDeps));

  // Reference data is often needed to populate public forms. If that applies,
  // move the read routes above this line and drop their `authorize` call.
  router.use(authenticate);

  // ------------------------------------------------------------- types
  router.get(
    '/types',
    validate({ query: listQuery }),
    authorize('master-data:read'),
    controller.listTypes,
  );

  router.post(
    '/types',
    validate({ body: createTypeBody }),
    authorize('master-data:create'),
    controller.createType,
  );

  router.get(
    '/types/:code',
    validate({ params: typeCodeParam }),
    authorize('master-data:read'),
    controller.getType,
  );

  router.patch(
    '/types/:code',
    validate({ params: typeCodeParam, body: updateTypeBody }),
    authorize('master-data:update'),
    controller.updateType,
  );

  router.delete(
    '/types/:code',
    validate({ params: typeCodeParam }),
    authorize('master-data:delete'),
    controller.deleteType,
  );

  // ------------------------------------------------------------- items
  router.get(
    '/types/:code/items',
    validate({ params: typeCodeParam, query: itemListQuery }),
    authorize('master-data:read'),
    controller.listItems,
  );

  router.post(
    '/types/:code/items',
    validate({ params: typeCodeParam, body: createItemBody }),
    authorize('master-data:create'),
    controller.createItem,
  );

  router.get(
    '/types/:code/items/:itemCode',
    validate({ params: itemCodeParams }),
    authorize('master-data:read'),
    controller.getItem,
  );

  router.patch(
    '/types/:code/items/:itemCode',
    validate({ params: itemCodeParams, body: updateItemBody }),
    authorize('master-data:update'),
    controller.updateItem,
  );

  router.delete(
    '/types/:code/items/:itemCode',
    validate({ params: itemCodeParams }),
    authorize('master-data:delete'),
    controller.deleteItem,
  );

  return router;
}
