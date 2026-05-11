/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BackendInfo } from '../types';
import {
  translateRequest,
  translateIndexCreateRequest,
  translateResponse,
  translateGetIndexResponse,
  downgradeFieldTypes,
} from './mapping_adapter';

const es6: BackendInfo = {
  distribution: 'elasticsearch',
  version: '6.8.23',
  majorVersion: 6,
  minorVersion: 8,
  patchVersion: 23,
};

describe('mapping_adapter', () => {
  describe('translateRequest', () => {
    it('adds include_type_name to querystring', () => {
      const params = { method: 'PUT', path: '/test/_mapping', querystring: {} };
      const result = translateRequest(params, es6);
      expect(result.querystring.include_type_name).toBe(true);
    });

    it('rewrites /{index}/_mapping to /{index}/_doc/_mapping', () => {
      const params = { method: 'PUT', path: '/test/_mapping', querystring: {} };
      const result = translateRequest(params, es6);
      expect(result.path).toBe('/test/_doc/_mapping');
    });

    it('does not rewrite bare /_mapping', () => {
      const params = { method: 'GET', path: '/_mapping', querystring: {} };
      const result = translateRequest(params, es6);
      expect(result.path).toBe('/_mapping');
    });
  });

  describe('translateIndexCreateRequest', () => {
    it('adds include_type_name and wraps mappings in _doc type', () => {
      const params = {
        method: 'PUT',
        path: '/test',
        querystring: {},
        body: { mappings: { properties: { title: { type: 'text' } } } },
      };
      const result = translateIndexCreateRequest(params, es6);
      expect(result.querystring.include_type_name).toBe(true);
      expect(result.body.mappings._doc).toBeDefined();
      expect(result.body.mappings._doc.properties.title.type).toBe('text');
    });

    it('passes through when body is not a plain object', () => {
      const params = {
        method: 'PUT',
        path: '/test',
        querystring: {},
        body: '{"mappings":{}}',
      };
      const result = translateIndexCreateRequest(params, es6);
      expect(result.body).toBe('{"mappings":{}}');
    });
  });

  describe('translateResponse', () => {
    it('unwraps typed mappings to typeless format', () => {
      const response = {
        body: {
          test: {
            mappings: { _doc: { properties: { title: { type: 'text' } } } },
          },
        },
      };
      const result = translateResponse(response, es6);
      expect(result.body.test.mappings.properties.title.type).toBe('text');
      expect(result.body.test.mappings._doc).toBeUndefined();
    });

    it('passes through already-typeless mappings', () => {
      const response = {
        body: {
          test: {
            mappings: { properties: { title: { type: 'text' } } },
          },
        },
      };
      const result = translateResponse(response, es6);
      expect(result.body.test.mappings.properties.title.type).toBe('text');
    });
  });

  describe('translateGetIndexResponse', () => {
    it('delegates to translateResponse', () => {
      const response = {
        body: {
          test: {
            mappings: { _doc: { properties: { title: { type: 'text' } } } },
          },
        },
      };
      const result = translateGetIndexResponse(response, es6);
      expect(result.body.test.mappings.properties).toBeDefined();
    });
  });

  describe('downgradeFieldTypes', () => {
    it('downgrades flattened to object with enabled:false', () => {
      const { properties } = downgradeFieldTypes({ data: { type: 'flattened' } });
      expect(properties.data.type).toBe('object');
      expect(properties.data.enabled).toBe(false);
    });

    it('downgrades search_as_you_type to text', () => {
      const { properties } = downgradeFieldTypes({
        name: { type: 'search_as_you_type', max_shingle_size: 3 },
      });
      expect(properties.name.type).toBe('text');
      expect((properties.name as any).max_shingle_size).toBeUndefined();
    });

    it('downgrades constant_keyword to keyword with null_value', () => {
      const { properties } = downgradeFieldTypes({
        env: { type: 'constant_keyword', value: 'production' },
      });
      expect(properties.env.type).toBe('keyword');
      expect(properties.env.null_value).toBe('production');
    });

    it('downgrades wildcard to keyword', () => {
      const { properties } = downgradeFieldTypes({ path: { type: 'wildcard' } });
      expect(properties.path.type).toBe('keyword');
    });

    it('downgrades version to keyword', () => {
      const { properties } = downgradeFieldTypes({ ver: { type: 'version' } });
      expect(properties.ver.type).toBe('keyword');
    });

    it('downgrades unsigned_long to long', () => {
      const { properties } = downgradeFieldTypes({ count: { type: 'unsigned_long' } });
      expect(properties.count.type).toBe('long');
    });

    it('leaves supported types unchanged', () => {
      const { properties } = downgradeFieldTypes({
        title: { type: 'text' },
        count: { type: 'integer' },
      });
      expect(properties.title.type).toBe('text');
      expect(properties.count.type).toBe('integer');
    });

    it('recursively downgrades nested properties', () => {
      const { properties } = downgradeFieldTypes({
        parent: {
          properties: { child: { type: 'flattened' } },
        },
      });
      expect(properties.parent.properties!.child.type).toBe('object');
    });

    it('reports downgrades', () => {
      const { downgrades } = downgradeFieldTypes({ data: { type: 'flattened' } });
      expect(downgrades).toHaveLength(1);
      expect(downgrades[0]).toContain('flattened');
    });
  });
});
