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
    it('round-trips UTF-8 strings', () => {
      const input = 'hello world';
      expect(decodeBase64(encodeBase64(input))).toBe(input);
    });

    it('handles empty string', () => {
      expect(decodeBase64(encodeBase64(''))).toBe('');
    });

    it('handles unicode characters', () => {
      const input = 'こんにちは';
      expect(decodeBase64(encodeBase64(input))).toBe(input);
    });
  });

  describe('encodeES6Version', () => {
    it('encodes version 0', () => {
      expect(encodeES6Version(0)).toBe('v6:0');
    });

    it('encodes positive integers', () => {
      expect(encodeES6Version(42)).toBe('v6:42');
    });

    it('throws on negative numbers', () => {
      expect(() => encodeES6Version(-1)).toThrow('non-negative integer');
    });

    it('throws on non-integers', () => {
      expect(() => encodeES6Version(1.5)).toThrow('non-negative integer');
    });
  });

  describe('decodeES6Version', () => {
    it('decodes valid version string', () => {
      expect(decodeES6Version('v6:42')).toEqual({ version: 42, versionType: 'external_gte' });
    });

    it('decodes version 0', () => {
      expect(decodeES6Version('v6:0')).toEqual({ version: 0, versionType: 'external_gte' });
    });

    it('throws on invalid prefix', () => {
      expect(() => decodeES6Version('v7:1')).toThrow('Invalid ES 6.x version string');
    });

    it('throws on non-numeric value', () => {
      expect(() => decodeES6Version('v6:abc')).toThrow('Invalid ES 6.x version number');
    });
  });

  describe('isES6VersionString', () => {
    it('returns true for valid v6: prefix', () => {
      expect(isES6VersionString('v6:123')).toBe(true);
    });

    it('returns false for other prefixes', () => {
      expect(isES6VersionString('v7:1')).toBe(false);
      expect(isES6VersionString('123')).toBe(false);
    });

    it('returns false for non-strings', () => {
      expect(isES6VersionString(null as any)).toBe(false);
      expect(isES6VersionString(undefined as any)).toBe(false);
    });
  });

  describe('ES6_VERSION_PREFIX', () => {
    it('is v6:', () => {
      expect(ES6_VERSION_PREFIX).toBe('v6:');
    });
  });
});
