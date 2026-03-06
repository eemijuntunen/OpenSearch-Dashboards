/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const encodeBase64 = (utf8: string) => Buffer.from(utf8, 'utf8').toString('base64');
export const decodeBase64 = (base64: string) => Buffer.from(base64, 'base64').toString('utf8');

export const ES6_VERSION_PREFIX = 'v6:';

export function encodeES6Version(version: number): string {
  if (!Number.isInteger(version) || version < 0) {
    throw new TypeError('ES 6.x version must be a non-negative integer');
  }
  return `${ES6_VERSION_PREFIX}${version}`;
}

export function decodeES6Version(versionString: string): { version: number; versionType: string } {
  if (!isES6VersionString(versionString)) {
    throw new Error(`Invalid ES 6.x version string: ${versionString}`);
  }
  const version = parseInt(versionString.slice(ES6_VERSION_PREFIX.length), 10);
  if (isNaN(version) || version < 0) {
    throw new Error(`Invalid ES 6.x version number in: ${versionString}`);
  }
  return { version, versionType: 'external_gte' };
}

export function isES6VersionString(version: string): boolean {
  return typeof version === 'string' && version.startsWith(ES6_VERSION_PREFIX);
}
