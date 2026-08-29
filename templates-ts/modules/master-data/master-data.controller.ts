import type { RequestHandler } from 'express';

import type { ListQuery } from '../../core/pagination.js';
import { paginationMeta, sendCreated, sendSuccess } from '../../core/response.js';

import type {
  CreateItemBody,
  CreateTypeBody,
  ItemListQuery,
  UpdateItemBody,
  UpdateTypeBody,
} from './master-data.schema.js';
import type { MasterDataService } from './master-data.service.js';

export function createMasterDataController(service: MasterDataService) {
  const listTypes: RequestHandler = async (req, res) => {
    const query = req.validated.query as ListQuery;
    const { rows, total } = await service.listTypes(query);

    sendSuccess(res, rows, { meta: paginationMeta(query.page, query.pageSize, total) });
  };

  const getType: RequestHandler = async (req, res) => {
    const { code } = req.validated.params as { code: string };
    sendSuccess(res, await service.getType(code));
  };

  const createType: RequestHandler = async (req, res) => {
    sendCreated(res, await service.createType(req.validated.body as CreateTypeBody));
  };

  const updateType: RequestHandler = async (req, res) => {
    const { code } = req.validated.params as { code: string };
    sendSuccess(res, await service.updateType(code, req.validated.body as UpdateTypeBody));
  };

  const deleteType: RequestHandler = async (req, res) => {
    const { code } = req.validated.params as { code: string };
    await service.deleteType(code);
    sendSuccess(res, { code, deleted: true });
  };

  const listItems: RequestHandler = async (req, res) => {
    const { code } = req.validated.params as { code: string };
    const query = req.validated.query as ItemListQuery;
    const { rows, total } = await service.listItems(code, query);

    sendSuccess(res, rows, { meta: paginationMeta(query.page, query.pageSize, total) });
  };

  const getItem: RequestHandler = async (req, res) => {
    const { code, itemCode } = req.validated.params as { code: string; itemCode: string };
    sendSuccess(res, await service.getItem(code, itemCode));
  };

  const createItem: RequestHandler = async (req, res) => {
    const { code } = req.validated.params as { code: string };
    sendCreated(res, await service.createItem(code, req.validated.body as CreateItemBody));
  };

  const updateItem: RequestHandler = async (req, res) => {
    const { code, itemCode } = req.validated.params as { code: string; itemCode: string };
    sendSuccess(
      res,
      await service.updateItem(code, itemCode, req.validated.body as UpdateItemBody),
    );
  };

  const deleteItem: RequestHandler = async (req, res) => {
    const { code, itemCode } = req.validated.params as { code: string; itemCode: string };
    await service.deleteItem(code, itemCode);
    sendSuccess(res, { code: itemCode, deleted: true });
  };

  return {
    listTypes,
    getType,
    createType,
    updateType,
    deleteType,
    listItems,
    getItem,
    createItem,
    updateItem,
    deleteItem,
  };
}
