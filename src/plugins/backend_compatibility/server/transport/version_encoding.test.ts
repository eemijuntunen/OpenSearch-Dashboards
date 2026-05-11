/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  encodeBase64,
  decodeBase64,
  encodeES6Version,
  decodeES6Version,
  isES6VersionString,
  ES6_VERSION_PREFIX,
} from './version_encoding';

describe('version_encoding', () => {
  describe('encodeBase64 / decodeBase64', () => {
    it('round-trips a string', () => {
      const original = 'hello world';
      expect(decodeBase64(encodeBase64(original))).toBe(original);
    });

    it('encodes to base64', () => {
      expect(encodeBase64('test')).toBe('dGVzdA==');
    });
  });

  describe('encodeES6Version', () => {
    it('encodes a version number with prefix', () => {
      expect(encodeES6Version(42)).toBe('v6:42');
    });

    it('encodes zero', () => {
      expect(encodeES6Version(0)).toBe('v6:0');
    });

    it('throws on negative numbers', () => {
      expect(() => encodeES6Version(-1)).toThrow('non-negative integer');
    });

    it('throws on non-integers', () => {
      expect(() => encodeES6Version(1.5)).toThrow('non-negative integer');
    });
  });

  describe('decodeES6Version', () => {
    it('decodes a valid version string', () => {
      const result = decodeES6Version('v6:42');
      expect(result.version).toBe(42);
      expect(result.versionType).toBe('external_gte');
    });

    it('throws on invalid prefix', () => {
      expect(() => decodeES6Version('v7:42')).toThrow('Invalid ES 6.x version string');
    });

    it('throws on non-numeric value', () => {
      expect(() => decodeES6Version('v6:abc')).toThrow('Invalid ES 6.x version number');
    });
  });

  describe('isES6VersionString', () => {
    it('returns true for valid ES6 version strings', () => {
      expect(isES6VersionString('v6:42')).toBe(true);
      expect(isES6VersionString('v6:0')).toBe(true);
    });

    it('returns false for other strings', () => {
      expect(isES6VersionString('v7:42')).toBe(false);
      expect(isES6VersionString('42')).toBe(false);
      expect(isES6VersionString('')).toBe(false);
    });

    it('returns false for non-strings', () => {
      expect(isES6VersionString(42 as any)).toBe(false);
      expect(isES6VersionString(null as any)).toBe(false);
    });
  });

  describe('ES6_VERSION_PREFIX', () => {
    it('is v6:', () => {
      expect(ES6_VERSION_PREFIX).toBe('v6:');
    });
  });
});
