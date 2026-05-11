/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreSetup, RequestHandlerContext } from 'src/core/server';
import { updateWorkspaceState } from '../../../../../../core/server/utils';
import { coreMock, httpServerMock } from '../../../../../../core/server/mocks';
import { createListRoute } from './list';
import { flightsSpecProvider } from '../data_sets';
import { SampleDatasetSchema } from '../lib/sample_dataset_registry_types';

const flightsSampleDataset = flightsSpecProvider();

const sampleDatasets: SampleDatasetSchema[] = [flightsSampleDataset];

// Helper to create a mock OpenSearch client with the new client structure
const createMockOpenSearchClient = (overrides: any = {}) => {
  return {
    indices: {
      exists: jest.fn().mockResolvedValue({ body: true }),
    },
    count: jest.fn().mockResolvedValue({ body: { count: 1 } }),
    ...overrides,
  };
};

describe('sample data list route', () => {
  let mockCoreSetup: MockedKeys<CoreSetup>;

  beforeEach(() => {
    mockCoreSetup = coreMock.createSetup();
  });

  it('handler calls expected api with the given request', async () => {
    const mockClient = createMockOpenSearchClient();

    const mockSOClientGetResponse = {
      saved_objects: [
        {
          type: 'dashboard',
          id: '7adfa750-4c81-11e8-b3d7-01146121b73d',
          namespaces: ['default'],
          attributes: { title: 'dashboard' },
        },
      ],
    };
    const mockSOClient = { get: jest.fn().mockResolvedValue(mockSOClientGetResponse) };

    const mockContext = {
      core: {
        opensearch: {
          client: { asCurrentUser: mockClient },
        },
        savedObjects: { client: mockSOClient },
      },
    };
    const mockBody = {};
    const mockQuery = {};
    const mockRequest = httpServerMock.createOpenSearchDashboardsRequest({
      body: mockBody,
      query: mockQuery,
    });
    const mockResponse = httpServerMock.createResponseFactory();

    createListRoute(mockCoreSetup.http.createRouter(), sampleDatasets);

    const mockRouter = mockCoreSetup.http.createRouter.mock.results[0].value;
    const handler = mockRouter.get.mock.calls[0][1];

    await handler((mockContext as unknown) as RequestHandlerContext, mockRequest, mockResponse);

    expect(mockClient.indices.exists).toBeCalled();
    expect(mockClient.count).toBeCalled();
    expect(mockResponse.ok).toBeCalled();
    expect(mockSOClient.get.mock.calls[0][1]).toMatch('7adfa750-4c81-11e8-b3d7-01146121b73d');
  });

  it('handler calls expected api with the given request with data source', async () => {
    const mockDataSourceId = 'dataSource';
    const mockClient = createMockOpenSearchClient();

    const mockSOClientGetResponse = {
      saved_objects: [
        {
          type: 'dashboard',
          id: `${mockDataSourceId}_7adfa750-4c81-11e8-b3d7-01146121b73d`,
          namespaces: ['default'],
          attributes: { title: 'dashboard' },
        },
      ],
    };
    const mockSOClient = { get: jest.fn().mockResolvedValue(mockSOClientGetResponse) };

    const mockContext = {
      dataSource: {
        opensearch: {
          getClient: jest.fn().mockResolvedValue(mockClient),
        },
      },
      core: {
        savedObjects: { client: mockSOClient },
      },
    };

    const mockBody = {};
    const mockQuery = { data_source_id: mockDataSourceId };
    const mockRequest = httpServerMock.createOpenSearchDashboardsRequest({
      body: mockBody,
      query: mockQuery,
    });
    const mockResponse = httpServerMock.createResponseFactory();

    createListRoute(mockCoreSetup.http.createRouter(), sampleDatasets);

    const mockRouter = mockCoreSetup.http.createRouter.mock.results[0].value;
    const handler = mockRouter.get.mock.calls[0][1];

    await handler((mockContext as unknown) as RequestHandlerContext, mockRequest, mockResponse);

    expect(mockContext.dataSource.opensearch.getClient).toBeCalledWith(mockDataSourceId);
    expect(mockClient.indices.exists).toBeCalled();
    expect(mockClient.count).toBeCalled();
    expect(mockResponse.ok).toBeCalled();
    expect(mockSOClient.get.mock.calls[0][1]).toMatch(
      `${mockDataSourceId}_7adfa750-4c81-11e8-b3d7-01146121b73d`
    );
  });

  it('handler calls expected api with the given request with workspace', async () => {
    const mockWorkspaceId = 'workspace';
    const mockClient = createMockOpenSearchClient();

    const mockSOClientGetResponse = {
      saved_objects: [
        {
          type: 'dashboard',
          id: `${mockWorkspaceId}_7adfa750-4c81-11e8-b3d7-01146121b73d`,
          namespaces: ['default'],
          attributes: { title: 'dashboard' },
        },
      ],
    };
    const mockSOClient = { get: jest.fn().mockResolvedValue(mockSOClientGetResponse) };

    const mockContext = {
      core: {
        opensearch: {
          client: { asCurrentUser: mockClient },
        },
        savedObjects: { client: mockSOClient },
      },
    };

    const mockBody = {};
    const mockQuery = {};
    const mockRequest = httpServerMock.createOpenSearchDashboardsRequest({
      body: mockBody,
      query: mockQuery,
    });
    updateWorkspaceState(mockRequest, { requestWorkspaceId: mockWorkspaceId });
    const mockResponse = httpServerMock.createResponseFactory();

    createListRoute(mockCoreSetup.http.createRouter(), sampleDatasets);

    const mockRouter = mockCoreSetup.http.createRouter.mock.results[0].value;
    const handler = mockRouter.get.mock.calls[0][1];

    await handler((mockContext as unknown) as RequestHandlerContext, mockRequest, mockResponse);

    expect(mockClient.indices.exists).toBeCalled();
    expect(mockClient.count).toBeCalled();
    expect(mockResponse.ok).toBeCalled();
    expect(mockSOClient.get.mock.calls[0][1]).toMatch(
      `${mockWorkspaceId}_7adfa750-4c81-11e8-b3d7-01146121b73d`
    );
  });

  it('handler calls expected api with the given request with workspace and data source', async () => {
    const mockWorkspaceId = 'workspace';
    const mockDataSourceId = 'dataSource';
    const mockClient = createMockOpenSearchClient();

    const mockSOClientGetResponse = {
      saved_objects: [
        {
          type: 'dashboard',
          id: `${mockWorkspaceId}_${mockDataSourceId}_7adfa750-4c81-11e8-b3d7-01146121b73d`,
          namespaces: ['default'],
          attributes: { title: 'dashboard' },
        },
      ],
    };
    const mockSOClient = { get: jest.fn().mockResolvedValue(mockSOClientGetResponse) };

    const mockContext = {
      dataSource: {
        opensearch: {
          getClient: jest.fn().mockResolvedValue(mockClient),
        },
      },
      core: {
        savedObjects: { client: mockSOClient },
      },
    };

    const mockBody = {};
    const mockQuery = { data_source_id: mockDataSourceId };
    const mockRequest = httpServerMock.createOpenSearchDashboardsRequest({
      body: mockBody,
      query: mockQuery,
    });
    updateWorkspaceState(mockRequest, { requestWorkspaceId: mockWorkspaceId });
    const mockResponse = httpServerMock.createResponseFactory();

    createListRoute(mockCoreSetup.http.createRouter(), sampleDatasets);

    const mockRouter = mockCoreSetup.http.createRouter.mock.results[0].value;
    const handler = mockRouter.get.mock.calls[0][1];

    await handler((mockContext as unknown) as RequestHandlerContext, mockRequest, mockResponse);

    expect(mockContext.dataSource.opensearch.getClient).toBeCalledWith(mockDataSourceId);
    expect(mockClient.indices.exists).toBeCalled();
    expect(mockClient.count).toBeCalled();
    expect(mockResponse.ok).toBeCalled();
    expect(mockSOClient.get.mock.calls[0][1]).toMatch(
      `${mockWorkspaceId}_${mockDataSourceId}_7adfa750-4c81-11e8-b3d7-01146121b73d`
    );
  });
});
