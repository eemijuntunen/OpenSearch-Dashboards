/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export type BackendDistribution = 'opensearch' | 'elasticsearch';

export interface BackendInfo {
  distribution: BackendDistribution;
  version: string;
  majorVersion: number;
  minorVersion: number;
  patchVersion: number;
}

export interface TransportRequestParams {
  method: string;
  path: string;
  body?: any;
  querystring?: Record<string, any>;
  bulkBody?: any[];
}

export interface TransportRequestOptions {
  ignore?: number[];
  requestTimeout?: number;
  maxRetries?: number;
  asStream?: boolean;
  headers?: Record<string, string>;
  [key: string]: any;
}

export const DEFAULT_DOCUMENT_TYPE = '_doc';
