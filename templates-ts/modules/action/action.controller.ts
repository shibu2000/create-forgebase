import type { RequestHandler } from 'express';

import type { ListQuery } from '../../core/pagination.js';
import { paginationMeta, sendCreated, sendSuccess } from '../../core/response.js';

import type { CreateActionBody, UpdateActionBody } from './action.schema.js';
import type { ActionService } from './action.service.js';

export function createActionController(service: ActionService) {
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
    sendCreated(res, await service.create(req.validated.body as CreateActionBody));
  };

  const update: RequestHandler = async (req, res) => {
    const { id } = req.validated.params as { id: string };
    sendSuccess(res, await service.update(id, req.validated.body as UpdateActionBody));
  };

  const remove: RequestHandler = async (req, res) => {
    const { id } = req.validated.params as { id: string };
    await service.remove(id);
    sendSuccess(res, { id, deleted: true });
  };

  return { list, getById, create, update, remove };
}
