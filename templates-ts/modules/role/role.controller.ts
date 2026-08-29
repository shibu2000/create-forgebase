import type { RequestHandler } from 'express';

import type { ListQuery } from '../../core/pagination.js';
import { paginationMeta, sendCreated, sendSuccess } from '../../core/response.js';

import type { CreateRoleBody, SetRoleActionsBody, UpdateRoleBody } from './role.schema.js';
import type { RoleService } from './role.service.js';

export function createRoleController(service: RoleService) {
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
    sendCreated(res, await service.create(req.validated.body as CreateRoleBody));
  };

  const update: RequestHandler = async (req, res) => {
    const { id } = req.validated.params as { id: string };
    sendSuccess(res, await service.update(id, req.validated.body as UpdateRoleBody));
  };

  const remove: RequestHandler = async (req, res) => {
    const { id } = req.validated.params as { id: string };
    await service.remove(id);
    sendSuccess(res, { id, deleted: true });
  };

  const getActions: RequestHandler = async (req, res) => {
    const { id } = req.validated.params as { id: string };
    const actions = await service.getActions(id);

    sendSuccess(res, actions, { meta: { count: actions.length } });
  };

  const setActions: RequestHandler = async (req, res) => {
    const { id } = req.validated.params as { id: string };
    const actions = await service.setActions(id, req.validated.body as SetRoleActionsBody);

    sendSuccess(res, actions, { meta: { count: actions.length } });
  };

  return { list, getById, create, update, remove, getActions, setActions };
}
