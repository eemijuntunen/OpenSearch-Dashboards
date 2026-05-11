/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { duration } from 'moment';
import { loggingSystemMock } from '../../../core/server/mocks';
import { DataSourcePluginConfigType } from '../config';
import { DataSourceService } from './data_source_service';

const mockConfigureClient = jest.fn().mockResolvedValue({});
jest.mock('./client/configure_client', () => ({
  configureClient: (...args: any[]) => mockConfigureClient(...args),
}));

const logger = loggingSystemMock.create();

describe('Data Source Service', () => {
  let service: DataSourceService;
  let config: DataSourcePluginConfigType;

  beforeEach(() => {
    const mockLogger = logger.get('dataSource');
    service = new DataSourceService(mockLogger);
    config = {
      enabled: true,
      clientPool: {
        size: 5,
      },
      globalOpenSearchConfig: {
        requestTimeout: duration(100, 'seconds'),
        pingTimeout: duration(10, 'seconds'),
      },
    } as DataSourcePluginConfigType;
    mockConfigureClient.mockClear();
  });

  afterEach(() => {
    service.stop();
    jest.clearAllMocks();
  });

  describe('setup()', () => {
    test('exposes proper contract', async () => {
      const setup = await service.setup(config);
      expect(setup).toHaveProperty('getDataSourceClient');
      expect(setup).toHaveProperty('getDataSourceLegacyClient');
    });
  });

  describe('setTransportClass()', () => {
    test('should pass custom transport to configureClient when set', async () => {
      const mockTransport = jest.fn() as any;
      service.setTransportClass(mockTransport);

      const setup = await service.setup(config);
      await setup.getDataSourceClient({} as any);

      expect(mockConfigureClient).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        mockTransport
      );
    });

    test('should pass undefined transport to configureClient when not set', async () => {
      const setup = await service.setup(config);
      await setup.getDataSourceClient({} as any);

      expect(mockConfigureClient).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        undefined
      );
    });
  });
});
