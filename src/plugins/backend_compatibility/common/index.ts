/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const PLUGIN_ID = 'backendCompatibility';
export const PLUGIN_NAME = 'Backend Compatibility';
export const DEFAULT_DOCUMENT_TYPE = '_doc';

export enum BackendDistribution {
  OpenSearch = 'opensearch',
  Elasticsearch = 'elasticsearch',
  Unknown = 'unknown',
}
