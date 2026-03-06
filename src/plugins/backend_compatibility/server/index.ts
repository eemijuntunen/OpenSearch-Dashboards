/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PluginInitializerContext, PluginConfigDescriptor } from '../../../../core/server';
import { BackendCompatibilityPlugin } from './plugin';
import { configSchema, BackendCompatibilityConfig } from './config';

export const config: PluginConfigDescriptor<BackendCompatibilityConfig> = {
  schema: configSchema,
  exposeToBrowser: {
    enabled: true,
  },
};

export function plugin(initializerContext: PluginInitializerContext) {
  return new BackendCompatibilityPlugin(initializerContext);
}

export type { BackendCompatibilityConfig } from './config';
export type { BackendCompatibilityPluginSetup, BackendCompatibilityPluginStart } from './plugin';
export type { BackendInfo, BackendDistribution } from './transport/types';
export {
  encodeBase64,
  decodeBase64,
  encodeES6Version,
  decodeES6Version,
  isES6VersionString,
  ES6_VERSION_PREFIX,
} from './transport/version_encoding';
