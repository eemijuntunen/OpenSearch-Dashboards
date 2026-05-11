/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isPlainObject, removeType, synthesizeSeqNo, normalizeTotalHits } from './normalization_utils';

describe('normalization_utils', () => {
  describe('isPlainObject', () => {
    it('returns true for plain objects', () => {
      expect(isPlainObject({ key: 'value' })).toBe(true);
      expect(isPlainObject({})).toBe(true);
    });

    it('returns false for null', () => {
      expect(isPlainObject(null)).toBe(false);
    });

    it('returns false for arrays', () => {
      expect(isPlainObject([1, 2, 3])).toBe(false);
    });

    it('returns false for strings', () => {
      expect(isPlainObject('hello')).toBe(false);
    });

    it('returns false for Buffers', () => {
      expect(isPlainObject(Buffer.from('test'))).toBe(false);
    });

    it('returns false for serialized Buffer format', () => {
      expect(isPlainObject({ type: 'Buffer', data: [1, 2, 3] })).toBe(false);
    });

    it('returns false for primitives', () => {
      expect(isPlainObject(42)).toBe(false);
      expect(isPlainObject(undefined)).toBe(false);
      expect(isPlainObject(true)).toBe(false);
    });
  });

  describe('removeType', () => {
    it('removes _type from object', () => {
      expect(removeType({ _id: '1', _type: '_doc', _source: {} })).toEqual({ _id: '1', _source: {} });
    });

    it('returns non-objects unchanged', () => {
      expect(removeType(null)).toBeNull();
      expect(removeType(undefined)).toBeUndefined();
    });
  });

  describe('synthesizeSeqNo', () => {
    it('sets _seq_no from _version and _primary_term to 1', () => {
      const doc = { _id: '1', _version: 7 };
      synthesizeSeqNo(doc);
      expect(doc).toEqual({ _id: '1', _version: 7, _seq_no: 7, _primary_term: 1 });
    });

    it('does not overwrite existing _seq_no', () => {
      const doc = { _id: '1', _version: 7, _seq_no: 10, _primary_term: 2 };
      synthesizeSeqNo(doc);
      expect(doc._seq_no).toBe(10);
      expect(doc._primary_term).toBe(2);
    });

    it('does nothing when _version is absent', () => {
      const doc = { _id: '1' };
      synthesizeSeqNo(doc);
      expect((doc as any)._seq_no).toBeUndefined();
    });
  });

  describe('normalizeTotalHits', () => {
    it('converts number to object format', () => {
      expect(normalizeTotalHits(42)).toEqual({ value: 42, relation: 'eq' });
    });

    it('passes through object format', () => {
      const total = { value: 42, relation: 'gte' };
      expect(normalizeTotalHits(total)).toBe(total);
    });

    it('returns zero for undefined', () => {
      expect(normalizeTotalHits(undefined)).toEqual({ value: 0, relation: 'eq' });
    });
  });
});
