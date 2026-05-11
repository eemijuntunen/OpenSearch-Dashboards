/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BackendInfo, DEFAULT_DOCUMENT_TYPE } from '../types';
import { isPlainObject, synthesizeSeqNo } from './normalization_utils';

/**
 * Strip if_seq_no/if_primary_term from querystring.
 * ES 6.x doesn't support these — stripping disables OCC on ES 6.x.
 * We can't convert to _version because migration reindexing resets _version to 1.
 */
function stripSeqNoFromQuerystring(
  qs: Record<string, any> | undefined
): Record<string, any> | undefined {
  if (!qs) return qs;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { if_seq_no, if_primary_term, ...rest } = qs;
  return rest;
}

export function translateBulkRequest(params: any, backend: BackendInfo): any {
  // The opensearch-js client passes bulk data as bulkBody (used for NDJSON serialization)
  // and also as body. We must transform whichever is present as an array.
  const source = Array.isArray(params.bulkBody)
    ? params.bulkBody
    : Array.isArray(params.body)
    ? params.body
    : null;
  if (!source) return params;

  const transformed = source.map((item: any) => {
    if (!item || typeof item !== 'object') return item;
    for (const action of ['index', 'create', 'update', 'delete']) {
      if (action in item && item[action] && typeof item[action] === 'object') {
        const meta = { ...item[action] };
        // Add _type if not present
        if (!meta._type && !meta.type) {
          meta._type = DEFAULT_DOCUMENT_TYPE;
        }
        // Strip if_seq_no/if_primary_term — OCC is disabled on ES 6.x
        // (see comment on stripSeqNoFromQuerystring for rationale)
        delete meta.if_seq_no;
        delete meta.if_primary_term;
        return { [action]: meta };
      }
    }
    return item;
  });
  // Bulk uses bulkBody for NDJSON serialization — clear body so the
  // Transport falls through to the bulkBody branch.
  return {
    ...params,
    body: undefined,
    bulkBody: transformed,
    querystring: stripSeqNoFromQuerystring(params.querystring),
  };
}

export function translateCreateRequest(params: any, backend: BackendInfo): any {
  const newPath = params.path.replace('/_create', '/_doc');
  const existing =
    typeof params.querystring === 'object' && params.querystring !== null ? params.querystring : {};
  // _create: strip seq_no (creates don't need version-based OCC)
  const qs = stripSeqNoFromQuerystring({ ...existing, op_type: 'create' });
  return { ...params, path: newPath, querystring: qs };
}

export function translateDocRequest(params: any, backend: BackendInfo): any {
  const qs = stripSeqNoFromQuerystring(params.querystring);
  let { path } = params;

  // ES 6.x: rewrite /{index}/_update/{id} → /{index}/_doc/{id}/_update
  const updateMatch = path.match(/^(\/[^/]+)\/_update\/(.+)$/);
  if (updateMatch) {
    path = `${updateMatch[1]}/_doc/${updateMatch[2]}/_update`;
    // ES 6.x _update doesn't support _source_include/_source_exclude
    if (qs) {
      delete qs._source_include;
      delete qs._source_exclude;
      delete qs._source_includes;
      delete qs._source_excludes;
    }
  }

  return { ...params, path, querystring: qs };
}

export function translateMgetRequest(params: any, backend: BackendInfo): any {
  // Skip if body is not a plain object (e.g., pre-serialized string)
  if (!isPlainObject(params.body) || !params.body.docs) {
    return params;
  }
  const docs = params.body.docs.map((doc: any) => ({
    ...doc,
    _type: doc._type || DEFAULT_DOCUMENT_TYPE,
  }));
  return { ...params, body: { ...params.body, docs } };
}

export function translateDeleteByQueryRequest(params: any, backend: BackendInfo): any {
  // _delete_by_query: strip seq_no (no per-document versioning)
  return { ...params, querystring: stripSeqNoFromQuerystring(params.querystring) };
}

export function translateResponse(response: any, backend: BackendInfo): any {
  const body = response?.body || response;
  if (!body) return response;

  if (body._id !== undefined) normalizeDocResponse(body);

  if (Array.isArray(body.items)) {
    body.items.forEach((item: any) => {
      for (const action of ['index', 'create', 'update', 'delete']) {
        if (item[action]) normalizeDocResponse(item[action]);
      }
    });
  }

  if (Array.isArray(body.docs)) {
    body.docs.forEach((doc: any) => {
      if (doc && !doc.error) normalizeDocResponse(doc);
    });
  }

  return response;
}

function normalizeDocResponse(doc: any): void {
  delete doc._type;
  synthesizeSeqNo(doc);
}
