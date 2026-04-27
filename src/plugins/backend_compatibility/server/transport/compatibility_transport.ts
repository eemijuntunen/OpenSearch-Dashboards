/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Transport } from '@opensearch-project/opensearch';
import { parse as parseQuerystring } from 'querystring';
import { BackendInfo } from './types';
import { detectBackend } from './backend_detector';
import * as searchAdapter from './adapters/search_adapter';
import * as documentAdapter from './adapters/document_adapter';
import * as mappingAdapter from './adapters/mapping_adapter';
import * as fieldCapsAdapter from './adapters/field_caps_adapter';
import * as scrollAdapter from './adapters/scroll_adapter';
import * as pluginApiAdapter from './adapters/plugin_api_adapter';

/** Detection timeout in milliseconds */
const DETECTION_TIMEOUT_MS = 30000;
/** Max detection attempts before permanently falling back to pass-through */
const MAX_DETECTION_ATTEMPTS = 3;

// ── Route Table ─────────────────────────────────────────────────────────
//
// Each entry maps a URL path pattern to request/response translators.
// Entries are evaluated in order — first match wins.
//
// Fields:
//   pattern   — regex tested against the normalized path (query params already stripped)
//   guard     — optional extra condition (method, body shape, etc.)
//   request   — transform params before sending to the backend
//   response  — transform the backend response before returning to the caller
//
// To add support for a new API:
//   1. Add an entry here
//   2. Write translateRequest/translateResponse in an adapter module

interface RouteEntry {
  /** Human-readable name for debugging */
  name: string;
  /** Regex matched against the path (after normalizeParams strips query params) */
  pattern: RegExp;
  /** Optional guard — return false to skip this entry even if the pattern matches */
  guard?: (params: any) => boolean;
  /** Request translator (ES 6.x) */
  request?: (params: any, backend: BackendInfo) => any;
  /** Response translator (ES 6.x) */
  response?: (response: any, backend: BackendInfo) => any;
  /** Response translator (ES 7.x) — if omitted, ES 7.x responses pass through */
  es7Response?: (response: any, backend: BackendInfo) => any;
}

/**
 * Strip _type from search/scroll hit arrays.
 * Used by ES 7.x response normalization.
 */
function stripTypeFromHits(response: any): any {
  const body = response?.body || response;
  if (body?.hits?.hits && Array.isArray(body.hits.hits)) {
    body.hits.hits = body.hits.hits.map((hit: any) => {
      if (!hit) return hit;
      const { _type, ...rest } = hit;
      return rest;
    });
  }
  return response;
}

/**
 * Strip _type from msearch response hits.
 * Used by ES 7.x response normalization.
 */
function stripTypeFromMsearchHits(response: any): any {
  const body = response?.body || response;
  if (!body?.responses) return response;

  body.responses = body.responses.map((res: any) => {
    if (res?.hits?.hits && Array.isArray(res.hits.hits)) {
      res.hits.hits = res.hits.hits.map((hit: any) => {
        if (!hit) return hit;
        const { _type, ...rest } = hit;
        return rest;
      });
    }
    return res;
  });

  return response;
}

/**
 * Declarative route table for ES 6.x and 7.x translation.
 *
 * ORDER MATTERS — more specific patterns must come before broader ones.
 * e.g. /_search/scroll before /_search, /_create before /_doc.
 */
const ROUTE_TABLE: RouteEntry[] = [
  // ── Plugin API rewriting ──────────────────────────────────────────
  // Rewrites /_plugins/* → /_opendistro/* when the backend is ES with OpenDistro installed.
  // Must run before other entries so subsequent matching sees the rewritten path.
  {
    name: 'plugin_api_rewrite',
    pattern: /^\/_plugins\//,
    request: pluginApiAdapter.translateRequest,
  },

  // ── Search ────────────────────────────────────────────────────────
  {
    name: 'scroll',
    pattern: /\/_search\/scroll(\/|$)/,
    request: scrollAdapter.translateRequest,
    response: scrollAdapter.translateResponse,
    es7Response: stripTypeFromHits,
  },
  {
    name: 'search',
    pattern: /\/_search(\/|$)/,
    request: searchAdapter.translateRequest,
    response: searchAdapter.translateResponse,
    es7Response: stripTypeFromHits,
  },
  {
    name: 'msearch',
    pattern: /\/_msearch(\/|$)/,
    request: searchAdapter.translateMsearchRequest,
    response: searchAdapter.translateMsearchResponse,
    es7Response: stripTypeFromMsearchHits,
  },

  // ── Documents ─────────────────────────────────────────────────────
  {
    name: 'bulk',
    pattern: /\/_bulk(\/|$)/,
    request: documentAdapter.translateBulkRequest,
    response: documentAdapter.translateResponse,
    es7Response: (res, backend) => documentAdapter.translateResponse(res, backend),
  },
  {
    name: 'create',
    pattern: /\/_create(\/|$)/,
    request: documentAdapter.translateCreateRequest,
    response: documentAdapter.translateResponse,
  },
  {
    name: 'mget',
    pattern: /\/_mget(\/|$)/,
    request: documentAdapter.translateMgetRequest,
    response: documentAdapter.translateResponse,
    es7Response: (res, backend) => documentAdapter.translateResponse(res, backend),
  },
  {
    name: 'delete_by_query',
    pattern: /\/_delete_by_query(\/|$)/,
    request: documentAdapter.translateDeleteByQueryRequest,
  },
  {
    name: 'doc_update',
    pattern: /\/_update(\/|$)/,
    request: documentAdapter.translateDocRequest,
    response: documentAdapter.translateResponse,
  },
  {
    name: 'doc_crud',
    pattern: /\/_doc(\/|$)/,
    request: documentAdapter.translateDocRequest,
    response: documentAdapter.translateResponse,
    es7Response: (res, backend) => documentAdapter.translateResponse(res, backend),
  },

  // ── Mappings ──────────────────────────────────────────────────────
  {
    name: 'mapping',
    pattern: /\/_mappings?(\/|$)/,
    request: mappingAdapter.translateRequest,
    response: mappingAdapter.translateResponse,
  },
  {
    name: 'index_create',
    pattern: /^\/[^/]+$/,
    guard: (params) => params.method === 'PUT' && !!params.body?.mappings,
    request: mappingAdapter.translateIndexCreateRequest,
  },
  {
    name: 'index_get',
    pattern: /^\/[^/]+$/,
    guard: (params) => params.method === 'GET',
    response: mappingAdapter.translateGetIndexResponse,
  },

  // ── Metadata ──────────────────────────────────────────────────────
  {
    name: 'field_caps',
    pattern: /\/_field_caps(\/|$)/,
    request: fieldCapsAdapter.translateRequest,
    response: fieldCapsAdapter.translateResponse,
  },
];

/**
 * Custom Transport that transparently translates requests/responses
 * for legacy Elasticsearch backends.
 *
 * This is the single interception point for ALL client API calls.
 * Every client method (search, bulk, index, etc.) calls transport.request().
 */
export class CompatibilityTransport extends Transport {
  /**
   * Last detected backend info, shared across instances.
   * Allows the plugin to expose getBackendInfo() without
   * coupling to a specific transport instance.
   */
  static lastDetectedBackend: BackendInfo | null = null;

  private backend: BackendInfo | null = null;
  private detecting: Promise<void> | null = null;
  private detectionAttempts = 0;

  async request(params: any, options?: any): Promise<any> {
    await this.ensureBackendDetected(options);

    // OpenSearch? Pass through entirely (zero overhead)
    if (!this.backend || this.backend.distribution === 'opensearch') {
      return super.request(params, options);
    }

    // ES 7.x: requests pass through unchanged, normalize select responses
    if (this.backend.majorVersion >= 7) {
      const response = await super.request(params, options);
      return this.applyES7Response(params, response);
    }

    // ES 6.x: intercept _resolve/index (API doesn't exist in ES 6.x)
    if (params.path?.includes('/_resolve/index')) {
      return this.handleResolveIndex(params, options);
    }

    // ES 6.x: route-table-driven translation
    const normalized = this.normalizeParams(params);
    const route = this.matchRoute(normalized);

    const translatedParams = route?.request ? route.request(normalized, this.backend) : normalized;

    const response = await super.request(translatedParams, options);

    return route?.response ? route.response(response, this.backend) : response;
  }

  // ── Route matching ──────────────────────────────────────────────────

  private matchRoute(params: any): RouteEntry | undefined {
    const { path } = params;
    if (!path) return undefined;

    for (const entry of ROUTE_TABLE) {
      if (entry.pattern.test(path)) {
        if (!entry.guard || entry.guard(params)) {
          return entry;
        }
      }
    }
    return undefined;
  }

  /** Apply ES 7.x response normalization (strip _type from hits). */
  private applyES7Response(params: any, response: any): any {
    const { path } = params;
    if (!path) return response;

    for (const entry of ROUTE_TABLE) {
      if (entry.es7Response && entry.pattern.test(path)) {
        if (!entry.guard || entry.guard(params)) {
          return entry.es7Response(response, this.backend!);
        }
      }
    }
    return response;
  }

  // ── Backend detection ───────────────────────────────────────────────

  private async ensureBackendDetected(options?: any): Promise<void> {
    if (this.backend) return;
    if (this.detecting) {
      await this.detecting;
      return;
    }
    this.detecting = this.performDetection(options);
    await this.detecting;
    this.detecting = null;
  }

  private async performDetection(options?: any): Promise<void> {
    this.detectionAttempts++;
    try {
      const detectionPromise = super.request({ method: 'GET', path: '/' }, options);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Backend detection timed out after ${DETECTION_TIMEOUT_MS}ms`)),
          DETECTION_TIMEOUT_MS
        );
      });

      const response = await Promise.race([detectionPromise, timeoutPromise]);
      const info = response?.body || response;
      this.backend = detectBackend(info);

      // If ES, probe for OpenDistro plugins so we can rewrite /_plugins/* paths.
      if (this.backend.distribution === 'elasticsearch') {
        try {
          const pluginsResponse = await super.request(
            {
              method: 'GET',
              path: '/_cat/plugins',
              querystring: { format: 'json', h: 'component' },
            },
            options
          );
          const plugins = pluginsResponse?.body || pluginsResponse;
          this.backend.hasOpenDistro =
            Array.isArray(plugins) &&
            plugins.some((p: any) =>
              (p.component || p.name || '').toLowerCase().startsWith('opendistro-')
            );
        } catch {
          this.backend.hasOpenDistro = false;
        }
      }

      CompatibilityTransport.lastDetectedBackend = this.backend;
    } catch (error) {
      if (this.detectionAttempts >= MAX_DETECTION_ATTEMPTS) {
        this.backend = {
          distribution: 'opensearch',
          version: '0.0.0',
          majorVersion: 0,
          minorVersion: 0,
          patchVersion: 0,
        };
      }
    }
  }

  // ── _resolve/index synthesis (ES 6.x) ──────────────────────────────

  private async handleResolveIndex(params: any, options?: any): Promise<any> {
    const pathMatch = params.path.match(/\/_resolve\/index\/(.+?)(?:\?|$)/);
    const pattern = pathMatch ? decodeURIComponent(pathMatch[1]) : '*';

    const [catIndicesRes, catAliasesRes] = await Promise.all([
      super
        .request(
          {
            method: 'GET',
            path: `/_cat/indices/${pattern}`,
            querystring: { format: 'json', h: 'index,status' },
          },
          options
        )
        .catch(() => ({ body: [] })),
      super
        .request(
          {
            method: 'GET',
            path: `/_cat/aliases/${pattern}`,
            querystring: { format: 'json', h: 'alias,index' },
          },
          options
        )
        .catch(() => ({ body: [] })),
    ]);

    const catIndices = catIndicesRes?.body || catIndicesRes || [];
    const catAliases = catAliasesRes?.body || catAliasesRes || [];

    const indices = Array.isArray(catIndices)
      ? catIndices.map((item: any) => ({ name: item.index, attributes: [item.status || 'open'] }))
      : [];

    const aliases = Array.isArray(catAliases)
      ? catAliases.map((item: any) => ({ name: item.alias, indices: [item.index] }))
      : [];

    return { body: { indices, aliases, data_streams: [] }, statusCode: 200 };
  }

  // ── Parameter normalization ─────────────────────────────────────────

  /**
   * Ensure params.querystring is always a plain object and extract any
   * query parameters embedded in params.path.
   */
  private normalizeParams(params: any): any {
    let path = params.path;
    let qs: Record<string, any> =
      typeof params.querystring === 'object' && params.querystring !== null
        ? { ...params.querystring }
        : {};

    // Extract query params embedded in the path
    if (path && path.includes('?')) {
      const idx = path.indexOf('?');
      const pathQs = parseQuerystring(path.substring(idx + 1));
      qs = { ...qs, ...pathQs };
      path = path.substring(0, idx);
    }

    // _source_includes → _source_include (ES 6.x name)
    if ('_source_includes' in qs) {
      qs._source_include = qs._source_includes;
      delete qs._source_includes;
    }
    if ('_source_excludes' in qs) {
      qs._source_exclude = qs._source_excludes;
      delete qs._source_excludes;
    }

    return { ...params, path, querystring: qs };
  }
}
