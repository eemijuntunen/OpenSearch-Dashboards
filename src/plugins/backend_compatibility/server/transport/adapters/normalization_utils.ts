/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Check if a value is a plain object (not null, array, Buffer, or primitive).
 * Translators must check this before spreading params.body — strings and Buffers
 * (e.g. from DevTools) produce malformed objects with numeric keys when spread.
 */
export function isPlainObject(value: any): value is Record<string, any> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  // Exclude Buffer objects (from DevTools/console proxy)
  if (Buffer.isBuffer(value)) {
    return false;
  }
  // Exclude serialized Buffer format { type: 'Buffer', data: [...] }
  if (value.type === 'Buffer' && Array.isArray(value.data)) {
    return false;
  }
  return true;
}

export function removeType(doc: any): any {
  if (!doc || typeof doc !== 'object') return doc;
  const { _type, ...rest } = doc;
  return rest;
}

export function synthesizeSeqNo(doc: any): any {
  if (doc._version !== undefined && doc._seq_no === undefined) {
    doc._seq_no = doc._version;
    doc._primary_term = 1;
  }
  return doc;
}

export function normalizeTotalHits(
  total: number | { value: number; relation: string } | undefined
): { value: number; relation: string } {
  if (total === undefined) return { value: 0, relation: 'eq' };
  if (typeof total === 'number') return { value: total, relation: 'eq' };
  return total;
}
