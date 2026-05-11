/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { first } from 'rxjs/operators';
import {
  CoreSetup,
  CoreStart,
  Logger,
  Plugin,
  PluginInitializerContext,
} from '../../../../core/server';
import { BackendCompatibilityConfig } from './config';
import { CompatibilityTransport } from './transport/compatibility_transport';
import { createLegacyRequestInterceptor } from './transport/legacy_interceptor';
import { BackendInfo } from './transport/types';
import { PLUGIN_NAME } from '../common';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface BackendCompatibilityPluginSetup {}

export interface BackendCompatibilityPluginStart {
  getBackendInfo: () => BackendInfo | undefined;
}

/**
 * Backend Compatibility Plugin
 *
 * Registers a custom Transport class with core that transparently adapts
 * requests/responses for legacy Elasticsearch backends. The entire setup is
 * a single registerClientTransport() call.
 */
export class BackendCompatibilityPlugin
  implements Plugin<BackendCompatibilityPluginSetup, BackendCompatibilityPluginStart> {
  private readonly logger: Logger;
  private readonly initializerContext: PluginInitializerContext;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
    this.initializerContext = initializerContext;
  }

  public async setup(core: CoreSetup): Promise<BackendCompatibilityPluginSetup> {
    const config = await this.initializerContext.config
      .create<BackendCompatibilityConfig>()
      .pipe(first())
      .toPromise();

    if (!config.enabled) {
      this.logger.info(`${PLUGIN_NAME} is disabled`);
      return {};
    }

    this.logger.info(`Setting up ${PLUGIN_NAME}`);

    // Register custom transport — this is the entire setup
    core.opensearch.registerClientTransport(CompatibilityTransport);

    // Register legacy client interceptor for /_plugins/* path rewriting
    // and response translation on older OpenDistro backends
    core.opensearch.registerLegacyRequestInterceptor(
      createLegacyRequestInterceptor(
        () => CompatibilityTransport.lastDetectedBackend
      )
    );

    this.logger.info('CompatibilityTransport registered with core');
    return {};
  }

  public async start(core: CoreStart): Promise<BackendCompatibilityPluginStart> {
    return {
      getBackendInfo: () => CompatibilityTransport.lastDetectedBackend ?? undefined,
    };
  }

  public stop() {
    this.logger.info(`Stopping ${PLUGIN_NAME}`);
  }
}
