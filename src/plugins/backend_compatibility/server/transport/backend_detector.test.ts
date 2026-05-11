/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { detectBackend, getBackendDescription } from './backend_detector';

describe('backend_detector', () => {
  describe('detectBackend', () => {
    it('detects OpenSearch by distribution field', () => {
      const info = {
        name: 'node',
        cluster_name: 'cluster',
        cluster_uuid: 'uuid',
        version: { number: '2.11.0', distribution: 'opensearch' },
        tagline: 'The OpenSearch Project',
      };
      const result = detectBackend(info);
      expect(result.distribution).toBe('opensearch');
      expect(result.majorVersion).toBe(2);
      expect(result.minorVersion).toBe(11);
    });

    it('detects OpenSearch by tagline', () => {
      const info = {
        name: 'node',
        cluster_name: 'cluster',
        cluster_uuid: 'uuid',
        version: { number: '1.0.0' },
        tagline: 'The OpenSearch Project: https://opensearch.org/',
      };
      const result = detectBackend(info);
      expect(result.distribution).toBe('opensearch');
    });

    it('detects Elasticsearch 6.x', () => {
      const info = {
        name: 'node',
        cluster_name: 'cluster',
        cluster_uuid: 'uuid',
        version: { number: '6.8.23' },
        tagline: 'You Know, for Search',
      };
      const result = detectBackend(info);
      expect(result.distribution).toBe('elasticsearch');
      expect(result.majorVersion).toBe(6);
      expect(result.minorVersion).toBe(8);
      expect(result.patchVersion).toBe(23);
    });

    it('detects Elasticsearch 7.x', () => {
      const info = {
        name: 'node',
        cluster_name: 'cluster',
        cluster_uuid: 'uuid',
        version: { number: '7.10.2' },
        tagline: 'You Know, for Search',
      };
      const result = detectBackend(info);
      expect(result.distribution).toBe('elasticsearch');
      expect(result.majorVersion).toBe(7);
      expect(result.minorVersion).toBe(10);
    });

    it('throws on unparseable version', () => {
      const info = {
        name: 'node',
        cluster_name: 'cluster',
        cluster_uuid: 'uuid',
        version: { number: 'invalid' },
      };
      expect(() => detectBackend(info)).toThrow('Unable to parse backend version');
    });
  });

  describe('getBackendDescription', () => {
    it('formats OpenSearch description', () => {
      expect(
        getBackendDescription({
          distribution: 'opensearch',
          version: '2.11.0',
          majorVersion: 2,
          minorVersion: 11,
          patchVersion: 0,
        })
      ).toBe('OpenSearch 2.11.0');
    });

    it('formats Elasticsearch description', () => {
      expect(
        getBackendDescription({
          distribution: 'elasticsearch',
          version: '6.8.23',
          majorVersion: 6,
          minorVersion: 8,
          patchVersion: 23,
        })
      ).toBe('Elasticsearch 6.8.23');
    });
  });
});
