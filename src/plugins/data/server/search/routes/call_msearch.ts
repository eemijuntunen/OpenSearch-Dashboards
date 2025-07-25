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

import { Observable } from 'rxjs';
import { first } from 'rxjs/operators';
import { ApiResponse } from '@opensearch-project/opensearch';
import { SearchResponse } from 'elasticsearch';
import {
  IUiSettingsClient,
  IScopedClusterClient,
  SharedGlobalConfig,
  OpenSearchClient,
} from 'src/core/server';

import { MsearchRequestBody, MsearchResponse } from '../../../common/search/search_source';
import { shimHitsTotal } from './shim_hits_total';
import { getShardTimeout, getDefaultSearchParams, toSnakeCase, shimAbortSignal } from '..';

/** @internal */
export function convertRequestBody(
  requestBody: MsearchRequestBody,
  { timeout }: { timeout?: string }
): string {
  return requestBody.searches.reduce((req, curr) => {
    const header = JSON.stringify({
      ignore_unavailable: true,
      ...curr.header,
    });
    const body = JSON.stringify({
      timeout,
      ...curr.body,
    });
    return `${req}${header}\n${body}\n`;
  }, '');
}

interface CallMsearchWithOpenSearchClientDependencies {
  opensearchClient: OpenSearchClient;
  globalConfig$: Observable<SharedGlobalConfig>;
  uiSettings: IUiSettingsClient;
}

export function getCallMsearchWithOpenSearchClient(
  dependencies: CallMsearchWithOpenSearchClientDependencies
) {
  return async (params: {
    body: MsearchRequestBody;
    signal?: AbortSignal;
  }): Promise<MsearchResponse> => {
    const { opensearchClient, globalConfig$, uiSettings } = dependencies;

    // get shardTimeout
    const config = await globalConfig$.pipe(first()).toPromise();
    const timeout = getShardTimeout(config);

    // trackTotalHits and dataFrameHydrationStrategy is not supported by msearch
    const {
      trackTotalHits,
      dataFrameHydrationStrategy,
      ...defaultParams
    } = await getDefaultSearchParams(uiSettings);

    const body = convertRequestBody(params.body, timeout);

    const promise = shimAbortSignal(
      opensearchClient.msearch(
        {
          // @ts-expect-error TS2322 TODO(ts-error): fixme
          body,
        },
        {
          querystring: toSnakeCase(defaultParams),
        }
      ),
      params.signal
    );
    // @ts-expect-error TS2352 TODO(ts-error): fixme
    const response = (await promise) as ApiResponse<{ responses: Array<SearchResponse<any>> }>;

    return {
      body: {
        ...response,
        body: {
          responses: response.body.responses?.map((r: SearchResponse<any>) => shimHitsTotal(r)),
        },
      },
    };
  };
}

interface CallMsearchDependencies {
  opensearchClient: IScopedClusterClient;
  globalConfig$: Observable<SharedGlobalConfig>;
  uiSettings: IUiSettingsClient;
}

/**
 * Helper for the `/internal/_msearch` route, exported separately here
 * so that it can be reused elsewhere in the data plugin on the server,
 * e.g. SearchSource
 *
 * @internal
 */
export function getCallMsearch(dependencies: CallMsearchDependencies) {
  return getCallMsearchWithOpenSearchClient({
    ...dependencies,
    opensearchClient: dependencies.opensearchClient.asCurrentUser,
  });
}
