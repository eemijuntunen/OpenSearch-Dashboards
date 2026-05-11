/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BackendInfo } from '../types';
import {
  translateBulkRequest,
  translateCreateRequest,
  translateDocRequest,
  translateMgetRequest,
  translateDeleteByQueryRequest,
  translateResponse,
} from './document_adapter';

const es6: BackendInfo = {
  distribution: 'elasticsearch',
  version: '6.8.23',
  majorVersion: 6,
  minorVersion: 8,
  patchVersion: 23,
};

describe('document_adapter', () => {
  describe('translateBulkRequest', () => {
    it('injects _type into bulk action metadata', () => {
      const params = {
        method: 'POST',
        path: '/_bulk',
        body: [{ index: { _index: 'test' } }, { field: 'value' }],
      };
      const result = translateBulkRequest(params, es6);
      expect(result.bulkBody[0].index._type).toBe('_doc');
    });

    it('strips if_seq_no and if_primary_term from bulk metadata', () => {
      const params = {
        method: 'POST',
        path: '/_bulk',
        body: [{ index: { _index: 'test', if_seq_no: 1, if_primary_term: 1 } }, { field: 'value' }],
      };
      const result = translateBulkRequest(params, es6);
      expect(result.bulkBody[0].index.if_seq_no).toBeUndefined();
      expect(result.bulkBody[0].index.if_primary_term).toBeUndefined();
    });

    it('sets body to undefined and uses bulkBody for NDJSON serialization', () => {
      const params = {
        method: 'POST',
        path: '/_bulk',
        body: [{ index: { _index: 'test' } }, { field: 'value' }],
      };
      const result = translateBulkRequest(params, es6);
      expect(result.body).toBeUndefined();
      expect(result.bulkBody).toBeDefined();
    });

    it('handles bulkBody param directly', () => {
      const params = {
        method: 'POST',
        path: '/_bulk',
        bulkBody: [{ index: { _index: 'test' } }, { field: 'value' }],
      };
      const result = translateBulkRequest(params, es6);
      expect(result.bulkBody[0].index._type).toBe('_doc');
    });
  });

  describe('translateCreateRequest', () => {
    it('rewrites /_create to /_doc with op_type=create', () => {
      const params = {
        method: 'PUT',
        path: '/test/_create/1',
        querystring: {},
      };
      const result = translateCreateRequest(params, es6);
      expect(result.path).toBe('/test/_doc/1');
      expect(result.querystring.op_type).toBe('create');
    });

    it('strips if_seq_no from querystring', () => {
      const params = {
        method: 'PUT',
        path: '/test/_create/1',
        querystring: { if_seq_no: 5, if_primary_term: 1 },
      };
      const result = translateCreateRequest(params, es6);
      expect(result.querystring.if_seq_no).toBeUndefined();
      expect(result.querystring.if_primary_term).toBeUndefined();
    });
  });

  describe('translateDocRequest', () => {
    it('strips if_seq_no and if_primary_term from querystring', () => {
      const params = {
        method: 'PUT',
        path: '/test/_doc/1',
        querystring: { if_seq_no: 3, if_primary_term: 1, refresh: 'true' },
      };
      const result = translateDocRequest(params, es6);
      expect(result.querystring.if_seq_no).toBeUndefined();
      expect(result.querystring.if_primary_term).toBeUndefined();
      expect(result.querystring.refresh).toBe('true');
    });

    it('rewrites _update path for ES 6.x', () => {
      const params = {
        method: 'POST',
        path: '/test/_update/1',
        querystring: {},
      };
      const result = translateDocRequest(params, es6);
      expect(result.path).toBe('/test/_doc/1/_update');
    });
  });

  describe('translateMgetRequest', () => {
    it('injects _type into mget docs', () => {
      const params = {
        method: 'POST',
        path: '/_mget',
        body: { docs: [{ _index: 'test', _id: '1' }] },
      };
      const result = translateMgetRequest(params, es6);
      expect(result.body.docs[0]._type).toBe('_doc');
    });

    it('passes through non-plain-object bodies', () => {
      const body = '{"docs":[]}';
      const params = { method: 'POST', path: '/_mget', body };
      const result = translateMgetRequest(params, es6);
      expect(result.body).toBe(body);
    });
  });

  describe('translateDeleteByQueryRequest', () => {
    it('strips if_seq_no from querystring', () => {
      const params = {
        method: 'POST',
        path: '/test/_delete_by_query',
        querystring: { if_seq_no: 1, if_primary_term: 1 },
      };
      const result = translateDeleteByQueryRequest(params, es6);
      expect(result.querystring.if_seq_no).toBeUndefined();
    });
  });

  describe('translateResponse', () => {
    it('removes _type and synthesizes _seq_no for single doc', () => {
      const response = { body: { _id: '1', _type: '_doc', _version: 3 } };
      const result = translateResponse(response, es6);
      expect(result.body._type).toBeUndefined();
      expect(result.body._seq_no).toBe(3);
      expect(result.body._primary_term).toBe(1);
    });

    it('normalizes bulk response items', () => {
      const response = {
        body: {
          items: [{ index: { _id: '1', _type: '_doc', _version: 2 } }],
        },
      };
      const result = translateResponse(response, es6);
      expect(result.body.items[0].index._type).toBeUndefined();
      expect(result.body.items[0].index._seq_no).toBe(2);
    });

    it('normalizes mget response docs', () => {
      const response = {
        body: {
          docs: [{ _id: '1', _type: '_doc', _version: 4 }],
        },
      };
      const result = translateResponse(response, es6);
      expect(result.body.docs[0]._type).toBeUndefined();
      expect(result.body.docs[0]._seq_no).toBe(4);
    });
  });
});
