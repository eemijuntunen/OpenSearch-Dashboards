/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BackendInfo } from '../types';
import {
  translateRequest,
  translateMsearchRequest,
  translateResponse,
  translateMsearchResponse,
} from './search_adapter';

const es6: BackendInfo = {
  distribution: 'elasticsearch',
  version: '6.8.23',
  majorVersion: 6,
  minorVersion: 8,
  patchVersion: 23,
};

describe('search_adapter', () => {
  describe('translateRequest', () => {
    it('removes track_total_hits', () => {
      const params = {
        method: 'POST',
        path: '/index/_search',
        body: { query: { match_all: {} }, track_total_hits: true },
      };
      const result = translateRequest(params, es6);
      expect(result.body.track_total_hits).toBeUndefined();
      expect(result.body.query).toEqual({ match_all: {} });
    });

    it('converts calendar_interval to interval', () => {
      const params = {
        method: 'POST',
        path: '/index/_search',
        body: { aggs: { dates: { date_histogram: { field: '@timestamp', calendar_interval: '1d' } } } },
      };
      const result = translateRequest(params, es6);
      expect(result.body.aggs.dates.date_histogram.interval).toBe('1d');
      expect(result.body.aggs.dates.date_histogram.calendar_interval).toBeUndefined();
    });

    it('converts fixed_interval to interval', () => {
      const params = {
        method: 'POST',
        path: '/index/_search',
        body: { aggs: { dates: { date_histogram: { field: '@timestamp', fixed_interval: '30s' } } } },
      };
      const result = translateRequest(params, es6);
      expect(result.body.aggs.dates.date_histogram.interval).toBe('30s');
    });

    it('converts auto_date_histogram to date_histogram', () => {
      const params = {
        method: 'POST',
        path: '/index/_search',
        body: { aggs: { dates: { auto_date_histogram: { field: '@timestamp', buckets: 50 } } } },
      };
      const result = translateRequest(params, es6);
      expect(result.body.aggs.dates.date_histogram).toBeDefined();
      expect(result.body.aggs.dates.date_histogram.interval).toBe('day');
      expect(result.body.aggs.dates.auto_date_histogram).toBeUndefined();
    });

    it('converts geotile_grid to geohash_grid', () => {
      const params = {
        method: 'POST',
        path: '/index/_search',
        body: { aggs: { tiles: { geotile_grid: { field: 'location', precision: 8 } } } },
      };
      const result = translateRequest(params, es6);
      expect(result.body.aggs.tiles.geohash_grid).toBeDefined();
      expect(result.body.aggs.tiles.geotile_grid).toBeUndefined();
    });

    it('drops unsupported aggregation types', () => {
      const params = {
        method: 'POST',
        path: '/index/_search',
        body: { aggs: { rare: { rare_terms: { field: 'status' } } } },
      };
      const result = translateRequest(params, es6);
      expect(result.body.aggs.rare.rare_terms).toBeUndefined();
    });

    it('drops unsupported query types', () => {
      const params = {
        method: 'POST',
        path: '/index/_search',
        body: { query: { intervals: { field: 'text', match: { query: 'hello' } } } },
      };
      const result = translateRequest(params, es6);
      expect(result.body.query.intervals).toBeUndefined();
    });

    it('converts query_string default_field * to all_fields', () => {
      const params = {
        method: 'POST',
        path: '/index/_search',
        body: { query: { query_string: { query: 'test', default_field: '*' } } },
      };
      const result = translateRequest(params, es6);
      expect(result.body.query.query_string.all_fields).toBe(true);
      expect(result.body.query.query_string.default_field).toBeUndefined();
    });

    it('recursively transforms nested bool queries', () => {
      const params = {
        method: 'POST',
        path: '/index/_search',
        body: {
          query: {
            bool: {
              must: [{ intervals: { field: 'text' } }, { match: { title: 'test' } }],
            },
          },
        },
      };
      const result = translateRequest(params, es6);
      // intervals is unsupported — its entry becomes {} (empty object), not removed from array
      expect(result.body.query.bool.must).toHaveLength(2);
      expect(result.body.query.bool.must[0]).toEqual({});
      expect(result.body.query.bool.must[1].match).toBeDefined();
    });

    it('passes through non-plain-object bodies unchanged', () => {
      const body = '{"query":{"match_all":{}}}';
      const params = { method: 'POST', path: '/index/_search', body };
      const result = translateRequest(params, es6);
      expect(result.body).toBe(body);
    });

    it('passes through Buffer bodies unchanged', () => {
      const body = Buffer.from('{"query":{}}');
      const params = { method: 'POST', path: '/index/_search', body };
      const result = translateRequest(params, es6);
      expect(result.body).toBe(body);
    });
  });

  describe('translateMsearchRequest', () => {
    it('transforms search bodies at odd indices', () => {
      const params = {
        method: 'POST',
        path: '/_msearch',
        body: [
          { index: 'my-index' },
          { query: { match_all: {} }, track_total_hits: true },
        ],
      };
      const result = translateMsearchRequest(params, es6);
      expect(result.body[0]).toEqual({ index: 'my-index' });
      expect(result.body[1].track_total_hits).toBeUndefined();
    });
  });

  describe('translateResponse', () => {
    it('normalizes hits.total from number to object', () => {
      const response = { body: { hits: { total: 42, hits: [] } } };
      const result = translateResponse(response, es6);
      expect(result.body.hits.total).toEqual({ value: 42, relation: 'eq' });
    });

    it('strips _type from hits', () => {
      const response = {
        body: { hits: { total: 1, hits: [{ _id: '1', _type: '_doc', _source: {} }] } },
      };
      const result = translateResponse(response, es6);
      expect(result.body.hits.hits[0]._type).toBeUndefined();
    });

    it('synthesizes _seq_no from _version', () => {
      const response = {
        body: { hits: { total: 1, hits: [{ _id: '1', _type: '_doc', _version: 5 }] } },
      };
      const result = translateResponse(response, es6);
      expect(result.body.hits.hits[0]._seq_no).toBe(5);
      expect(result.body.hits.hits[0]._primary_term).toBe(1);
    });
  });

  describe('translateMsearchResponse', () => {
    it('normalizes each sub-response', () => {
      const response = {
        body: {
          responses: [
            { hits: { total: 10, hits: [{ _id: '1', _type: '_doc' }] } },
          ],
        },
      };
      const result = translateMsearchResponse(response, es6);
      expect(result.body.responses[0].hits.total).toEqual({ value: 10, relation: 'eq' });
      expect(result.body.responses[0].hits.hits[0]._type).toBeUndefined();
    });
  });
});
