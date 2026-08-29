import type { RequestHandler } from 'express';

import type { ListQuery } from '../../core/pagination.js';
import { paginationMeta, sendCreated, sendSuccess } from '../../core/response.js';

import type { CreateUserBody, SetUserRolesBody, UpdateUserBody } from './user.schema.js';
import type { UserService } from './user.service.js';

/**
 * Translates HTTP to service calls and back. No business logic, no data
 * access — if a decision is being made here, it belongs in the service.
 *
 * Errors are thrown, not caught: Express 5 forwards a rejected handler to the
 * centralised error middleware, which owns the error envelope.
 */
export function createUserController(service: UserService) {
  const list: RequestHandler = async (req, res) => {
    const query = req.validated.query as ListQuery;
    const { rows, total } = await service.list(query);

    sendSuccess(res, rows, { meta: paginationMeta(query.page, query.pageSize, total) });
  };

  const getById: RequestHandler = async (req, res) => {
    const { id } = req.validated.params as { id: string };
    sendSuccess(res, await service.getById(id));
  };

  const create: RequestHandler = async (req, res) => {
    sendCreated(res, await service.create(req.validated.body as CreateUserBody));
  };

  const update: RequestHandler = async (req, res) => {
    const { id } = req.validated.params as { id: string };
    sendSuccess(res, await service.update(id, req.validated.body as UpdateUserBody));
  };

  const remove: RequestHandler = async (req, res) => {
    const { id } = req.validated.params as { id: string };
    await service.remove(id);

    // 200 with an envelope rather than a bare 204, so every response from
    // this API can be branched on with the same `success` field.
    sendSuccess(res, { id, deleted: true });
  };

  const setRoles: RequestHandler = async (req, res) => {
    const { id } = req.validated.params as { id: string };
    sendSuccess(res, await service.setRoles(id, req.validated.body as SetUserRolesBody));
  };

  const getEffectiveActions: RequestHandler = async (req, res) => {
    const { id } = req.validated.params as { id: string };
    const actions = await service.getEffectiveActions(id);

    sendSuccess(res, { actions }, { meta: { count: actions.length } });
  };

  return { list, getById, create, update, remove, setRoles, getEffectiveActions };
}
