/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BackendInfo } from './types';
import { rewritePluginPath } from './adapters/plugin_api_adapter';

/**
 * Response field mappings for older OpenDistro endpoints that use
 * different field names than the current OpenSearch Security plugin.
 *
 * dashboardsinfo → kibanainfo field mapping:
 *   kibana_mt_enabled        → multitenancy_enabled
 *   kibana_index              → dashboards_index
 *   kibana_server_user        → dashboards_server_user
 *   not_fail_on_forbidden_enabled → (kept as-is)
 */
function translateKibanaInfoResponse(body: any): any {
  if (!body || typeof body !== 'object') return body;
  return {
    ...body,
    multitenancy_enabled: body.kibana_mt_enabled ?? false,
    private_tenant_enabled: true,
    default_tenant: '',
    dashboards_index: body.kibana_index,
    dashboards_server_user: body.kibana_server_user,
  };
}

/**
 * Path rewrites for older OpenDistro that uses different endpoint names.
 * These are applied AFTER the /_plugins/ → /_opendistro/ rewrite.
 */
const OPENDISTRO_PATH_REWRITES: Array<[string | RegExp, string]> = [
  ['/_opendistro/_security/dashboardsinfo', '/_opendistro/_security/kibanainfo'],
];

/**
 * Endpoints whose responses need field translation.
 */
const RESPONSE_TRANSLATORS: Record<string, (body: any) => any> = {
  '/_opendistro/_security/kibanainfo': translateKibanaInfoResponse,
};

/**
 * Strip the type wrapper from ES 6.x mapping responses.
 * ES 6.x: { "index": { "mappings": { "_doc": { "properties": {...} } } } }
 * Expected: { "index": { "mappings": { "properties": {...} } } }
 */
function normalizeMappingResponse(body: any): any {
  if (!body || typeof body !== 'object') return body;
  for (const index of Object.keys(body)) {
    const mappings = body[index]?.mappings;
    if (mappings && typeof mappings === 'object') {
      const typeNames = Object.keys(mappings);
      if (typeNames.length === 1 && typeNames[0] !== 'properties') {
        body[index].mappings = mappings[typeNames[0]];
      }
    }
  }
  return body;
}

/**
 * Field name mappings for older OpenDistro alerting schema.
 * The newer plugin uses top-level fields; older OpenDistro nests under `monitor.*`.
 */
const ALERTING_SORT_FIELD_MAP: Record<string, string> = {
  start_time: 'monitor.last_update_time',
  'monitor.name': 'monitor.name',
  'monitor.enabled': 'monitor.enabled',
};

/**
 * Rewrite sort fields in alerting search request bodies for older OpenDistro.
 */
function translateAlertingSearchBody(params: any): any {
  if (!params.body) return params;
  const body = typeof params.body === 'string' ? JSON.parse(params.body) : { ...params.body };
  let changed = false;

  const rewriteSortArray = (sort: any[]): any[] =>
    sort.map((s: any) => {
      if (typeof s === 'object' && s !== null) {
        const entries = Object.entries(s);
        if (entries.length === 1) {
          const [field, order] = entries[0];
          if (ALERTING_SORT_FIELD_MAP[field]) {
            changed = true;
            return { [ALERTING_SORT_FIELD_MAP[field]]: order };
          }
        }
      }
      return s;
    });

  if (Array.isArray(body.sort)) {
    body.sort = rewriteSortArray(body.sort);
  }

  // Recursively rewrite sort fields inside aggregations (e.g., top_hits)
  const rewriteObj = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj.sort)) {
      obj.sort = rewriteSortArray(obj.sort);
    }
    if (obj.field && ALERTING_SORT_FIELD_MAP[obj.field]) {
      obj.field = ALERTING_SORT_FIELD_MAP[obj.field];
      changed = true;
    }
    for (const val of Object.values(obj)) {
      if (val && typeof val === 'object') rewriteObj(val);
    }
  };
  rewriteObj(body.aggs || body.aggregations);

  if (!changed) return params;
  return { ...params, body: typeof params.body === 'string' ? JSON.stringify(body) : body };
}

/**
 * Query parameters that the older OpenDistro alerting API doesn't support.
 * The newer OpenSearch alerting API added these for server-side filtering/pagination,
 * but older versions require the client to filter results locally.
 */
const ALERTING_UNSUPPORTED_PARAMS = [
  'alertState', 'searchString', 'severityLevel', 'size',
  'sortOrder', 'sortString', 'startIndex', 'monitorId',
  'workflowIds', 'getAssociatedAlerts', 'alertIds', 'index',
];

/**
 * Strip unsupported query parameters from alerting API paths.
 * The legacy elasticsearch-js client appends extra params as query string.
 */
function stripUnsupportedAlertingParams(params: any): any {
  if (!params.path) return params;
  const path = params.path;
  if (!path.includes('/_opendistro/_alerting/') && !path.includes('/_plugins/_alerting/')) {
    return params;
  }

  // Strip from query object
  if (params.query && typeof params.query === 'object') {
    const cleaned = { ...params.query };
    let changed = false;
    for (const key of ALERTING_UNSUPPORTED_PARAMS) {
      if (key in cleaned) {
        delete cleaned[key];
        changed = true;
      }
    }
    if (changed) {
      params = { ...params, query: cleaned };
    }
  }

  // Strip from path query string
  if (path.includes('?')) {
    const [basePath, qs] = path.split('?', 2);
    const searchParams = new URLSearchParams(qs);
    let changed = false;
    for (const key of ALERTING_UNSUPPORTED_PARAMS) {
      if (searchParams.has(key)) {
        searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) {
      const newQs = searchParams.toString();
      params = { ...params, path: newQs ? `${basePath}?${newQs}` : basePath };
    }
  }

  return params;
}

/**
 * Creates a legacy request interceptor function that rewrites paths
 * and translates responses for ES backends with OpenDistro.
 */
export function createLegacyRequestInterceptor(
  getBackendInfo: () => BackendInfo | null
): (params: any, cb?: any) => any {
  return (params: any, _cb?: any) => {
    if (!params?.path || typeof params.path !== 'string') return { params };

    const backend = getBackendInfo();
    if (!backend || backend.distribution !== 'elasticsearch') return { params };

    let responseTransform: ((body: any) => any) | undefined;

    // Step 1: Rewrite /_plugins/* → /_opendistro/* (if OpenDistro detected)
    if (params.path.includes('/_plugins/') && backend.hasOpenDistro) {
      params = { ...params, path: rewritePluginPath(params.path, backend) };
    }

    // Step 2: Strip unsupported query params for older OpenDistro APIs
    params = stripUnsupportedAlertingParams(params);

    // Step 2b: Translate alerting search body sort fields
    if (params.path.includes('/_alerting/') && params.path.includes('/_search')) {
      params = translateAlertingSearchBody(params);
    }

    // Step 3: Normalize mapping responses (strip type wrapper from ES 6.x)
    if (params.path.includes('/_mapping')) {
      responseTransform = normalizeMappingResponse;
    }

    // Step 4: Rewrite OpenDistro-specific endpoint names
    for (const [from, to] of OPENDISTRO_PATH_REWRITES) {
      if (typeof from === 'string' ? params.path === from : from.test(params.path)) {
        params = { ...params, path: to as string };
        const translator = RESPONSE_TRANSLATORS[to as string];
        if (translator) {
          responseTransform = translator;
        }
        break;
      }
    }

    return { params, responseTransform };
  };
}
