/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Any modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { PluginInitializerContext } from '../../../core/public';
import { VisualizationsSetup, VisualizationsStart } from './';
import { VisualizationsPlugin } from './plugin';
import { coreMock, applicationServiceMock } from '../../../core/public/mocks';
import { embeddablePluginMock } from '../../embeddable/public/mocks';
import { expressionsPluginMock } from '../../expressions/public/mocks';
import { dataPluginMock } from '../../data/public/mocks';
import { usageCollectionPluginMock } from '../../usage_collection/public/mocks';
import { uiActionsPluginMock } from '../../ui_actions/public/mocks';
import { inspectorPluginMock } from '../../inspector/public/mocks';
import { dashboardPluginMock } from '../../dashboard/public/mocks';

const createSetupContract = (): VisualizationsSetup => ({
  createBaseVisualization: jest.fn(),
  createReactVisualization: jest.fn(),
  registerAlias: jest.fn(),
  hideTypes: jest.fn(),
});

const createStartContract = (): VisualizationsStart => ({
  get: jest.fn(),
  all: jest.fn(),
  getAliases: jest.fn(),
  savedVisualizationsLoader: {
    get: jest.fn(),
  } as any,
  showNewVisModal: jest.fn(),
  createVis: jest.fn(),
  convertFromSerializedVis: jest.fn(),
  convertToSerializedVis: jest.fn(),
  __LEGACY: {
    createVisEmbeddableFromObject: jest.fn(),
  },
});

const createInstance = async () => {
  const plugin = new VisualizationsPlugin({} as PluginInitializerContext);

  const setup = plugin.setup(coreMock.createSetup(), {
    data: dataPluginMock.createSetupContract(),
    embeddable: embeddablePluginMock.createSetupContract(),
    expressions: expressionsPluginMock.createSetupContract(),
    inspector: inspectorPluginMock.createSetupContract(),
    usageCollection: usageCollectionPluginMock.createSetupContract(),
  });
  const doStart = () =>
    // @ts-expect-error TS2345 TODO(ts-error): fixme
    plugin.start(coreMock.createStart(), {
      data: dataPluginMock.createStartContract(),
      expressions: expressionsPluginMock.createStartContract(),
      inspector: inspectorPluginMock.createStartContract(),
      uiActions: uiActionsPluginMock.createStartContract(),
      application: applicationServiceMock.createStartContract(),
      embeddable: embeddablePluginMock.createStartContract(),
      dashboard: dashboardPluginMock.createStartContract(),
      getAttributeService: jest.fn(),
      savedObjectsClient: coreMock.createStart().savedObjects.client,
    });

  return {
    plugin,
    setup,
    doStart,
  };
};

export const visualizationsPluginMock = {
  createSetupContract,
  createStartContract,
  createInstance,
};
