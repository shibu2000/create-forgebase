import { describe, expect, it, jest } from '@jest/globals';

import type {
  MasterDataItemRepository,
  MasterDataTypeRepository,
} from '../../src/modules/master-data/master-data.repository.interface.js';
import { createMasterDataService } from '../../src/modules/master-data/master-data.service.js';
import type { MasterDataType } from '../../src/modules/master-data/master-data.types.js';
import { fakeUnitOfWork, repoOf } from '../helpers/mocks.js';

const cityType: MasterDataType = {
  id: 'type-1',
  code: 'CITY',
  name: 'Cities',
  description: null,
};

function buildService(
  overrides: {
    types?: Partial<MasterDataTypeRepository>;
    items?: Partial<MasterDataItemRepository>;
  } = {},
) {
  const types: Partial<MasterDataTypeRepository> = {
    findByCode: jest.fn(async () => cityType),
    findById: jest.fn(async () => cityType),
    create: jest.fn(async () => cityType),
    update: jest.fn(async () => cityType),
    delete: jest.fn(async () => true),
    ...overrides.types,
  };

  const items: Partial<MasterDataItemRepository> = {
    countByType: jest.fn(async () => 0),
    findByCode: jest.fn(async () => null),
    delete: jest.fn(async () => true),
    ...overrides.items,
  };

  return {
    types,
    items,
    service: createMasterDataService({
      types: repoOf(types),
      items: repoOf(items),
      uow: fakeUnitOfWork,
    }),
  };
}

describe('createMasterDataService', () => {
  it('refuses to delete a type that still holds items', async () => {
    const { types, service } = buildService({ items: { countByType: jest.fn(async () => 7) } });

    await expect(service.deleteType('CITY')).rejects.toMatchObject({
      statusCode: 409,
      code: 'MASTER_DATA_TYPE_IN_USE',
      details: { itemCount: 7 },
    });

    // The database would cascade happily; refusing is a deliberate choice, so
    // it has to be asserted rather than assumed.
    expect(types.delete).not.toHaveBeenCalled();
  });

  it('deletes a type once it is empty', async () => {
    const { types, service } = buildService();

    await service.deleteType('CITY');
    expect(types.delete).toHaveBeenCalledWith('type-1');
  });

  it('raises 404 for an unknown type rather than returning an empty list', async () => {
    const { service } = buildService({ types: { findByCode: jest.fn(async () => null) } });

    await expect(
      service.listItems('NOPE', { page: 1, pageSize: 20, activeOnly: false }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'MASTER_DATA_TYPE_NOT_FOUND',
    });
  });

  it('scopes item lookups to the type from the URL', async () => {
    const { items, service } = buildService({
      items: {
        findByCode: jest.fn(async () => ({
          id: 'item-1',
          typeId: 'type-1',
          code: 'LON',
          label: 'London',
          meta: null,
          sortOrder: 0,
          isActive: true,
        })),
      },
    });

    await service.getItem('CITY', 'LON');

    // Scoped by type id, not searched globally — otherwise "LON" under
    // TOUR_TYPE could be returned for a CITY request.
    expect(items.findByCode).toHaveBeenCalledWith('type-1', 'LON');
  });
});
