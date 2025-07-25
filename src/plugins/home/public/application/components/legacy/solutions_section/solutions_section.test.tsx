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

import React from 'react';
import { shallow } from 'enzyme';
import { SolutionsSection } from './solutions_section';
import { FeatureCatalogueCategory } from '../../../../services';

const solutionEntry1 = {
  id: 'opensearchDashboards',
  title: 'OpenSearch Dashboards',
  subtitle: 'Visualize & analyze',
  appDescriptions: ['Analyze data in dashboards'],
  icon: 'inputOutput',
  path: 'opensearch_dashboards_landing_page',
  order: 1,
};
const solutionEntry2 = {
  id: 'solution-2',
  title: 'Solution two',
  subtitle: 'Subtitle for solution two',
  description: 'Description for solution two',
  appDescriptions: ['Example use case'],
  icon: 'empty',
  path: 'path-to-solution-two',
  order: 2,
};
const solutionEntry3 = {
  id: 'solution-3',
  title: 'Solution three',
  subtitle: 'Subtitle for solution three',
  description: 'Description for solution three',
  appDescriptions: ['Example use case'],
  icon: 'empty',
  path: 'path-to-solution-three',
  order: 3,
};
const solutionEntry4 = {
  id: 'solution-4',
  title: 'Solution four',
  subtitle: 'Subtitle for solution four',
  description: 'Description for solution four',
  appDescriptions: ['Example use case'],
  icon: 'empty',
  path: 'path-to-solution-four',
  order: 4,
};

const mockDirectories = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Description of dashboard',
    icon: 'dashboardApp',
    path: 'dashboard_landing_page',
    showOnHomePage: false,
    category: FeatureCatalogueCategory.DATA,
  },
  {
    id: 'discover',
    title: 'Discover',
    description: 'Description of discover',
    icon: 'discoverApp',
    path: 'discover_landing_page',
    showOnHomePage: false,
    category: FeatureCatalogueCategory.DATA,
  },
  {
    id: 'canvas',
    title: 'Canvas',
    description: 'Description of canvas',
    icon: 'canvasApp',
    path: 'canvas_landing_page',
    showOnHomePage: false,
    category: FeatureCatalogueCategory.DATA,
  },
];

const addBasePathMock = (path: string) => (path ? path : 'path');

const branding = {
  darkMode: false,
  mark: {
    defaultUrl: '/defaultModeLogo',
    darkModeUrl: '/darkModeLogo',
  },
  applicationTitle: 'custom title',
};

describe('SolutionsSection', () => {
  test('only renders a spacer if no solutions are available', () => {
    const component = shallow(
      // @ts-expect-error TS2741 TODO(ts-error): fixme
      <SolutionsSection
        addBasePath={addBasePathMock}
        solutions={[]}
        directories={mockDirectories}
        branding={branding}
      />
    );
    expect(component).toMatchSnapshot();
  });

  test('renders a single solution', () => {
    const component = shallow(
      // @ts-expect-error TS2741 TODO(ts-error): fixme
      <SolutionsSection
        addBasePath={addBasePathMock}
        solutions={[solutionEntry1]}
        directories={mockDirectories}
        branding={branding}
      />
    );
    expect(component).toMatchSnapshot();
  });

  test('renders multiple solutions in two columns with OpenSearch Dashboards in its own column', () => {
    const component = shallow(
      // @ts-expect-error TS2741 TODO(ts-error): fixme
      <SolutionsSection
        addBasePath={addBasePathMock}
        solutions={[solutionEntry1, solutionEntry2, solutionEntry3, solutionEntry4]}
        directories={mockDirectories}
        branding={branding}
      />
    );
    expect(component).toMatchSnapshot();
  });
  test('renders multiple solutions in a single column when OpenSearch Dashboards apps are not enabled', () => {
    const component = shallow(
      // @ts-expect-error TS2741 TODO(ts-error): fixme
      <SolutionsSection
        addBasePath={addBasePathMock}
        solutions={[solutionEntry2, solutionEntry3, solutionEntry4]}
        directories={mockDirectories}
        branding={branding}
      />
    );
    expect(component).toMatchSnapshot();
  });
});
