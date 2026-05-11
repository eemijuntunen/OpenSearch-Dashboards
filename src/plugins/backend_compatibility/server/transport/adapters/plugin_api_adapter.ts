/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BackendInfo } from '../types';

/**
 * Map OpenSearch plugin API paths to their OpenDistro equivalents.
 *
 * OpenDistro was the predecessor to OpenSearch and ships with ES 6.x/7.x.
 * The plugin APIs are largely the same but use `/_opendistro/*` instead of
 * `/_plugins/*`. When OSD connects to an ES cluster with OpenDistro installed,
 * we rewrite plugin paths so the OSD plugins (which target OpenSearch paths)
 * reach the correct OpenDistro endpoints.
 *
 * Order matters — more specific patterns must come first when there's overlap.
 */
const PLUGIN_PATH_REWRITES: Array<[RegExp, string]> = [
  // Alerting
  [/^\/_plugins\/_alerting\b/, '/_opendistro/_alerting'],

  // Security (Dashboards plugin hits /_plugins/_security/api/*)
  [/^\/_plugins\/_security\b/, '/_opendistro/_security'],

  // Index State Management
  [/^\/_plugins\/_ism\b/, '/_opendistro/_ism'],

  // Anomaly Detection
  [/^\/_plugins\/_anomaly_detection\b/, '/_opendistro/_anomaly_detection'],

  // Notifications
  [/^\/_plugins\/_notifications\b/, '/_opendistro/_notifications'],

  // Async Search
  [/^\/_plugins\/_asynchronous_search\b/, '/_opendistro/_asynchronous_search'],

  // Reports
  [/^\/_plugins\/_reports\b/, '/_opendistro/_reports'],

  // SQL
  [/^\/_plugins\/_sql\b/, '/_opendistro/_sql'],

  // PPL
  [/^\/_plugins\/_ppl\b/, '/_opendistro/_ppl'],

  // Observability
  [/^\/_plugins\/_observability\b/, '/_opendistro/_observability'],

  // Performance Analyzer
  [/^\/_plugins\/_performanceanalyzer\b/, '/_opendistro/_performanceanalyzer'],

  // KNN
  [/^\/_plugins\/_knn\b/, '/_opendistro/_knn'],

  // Cross-cluster replication
  [/^\/_plugins\/_replication\b/, '/_opendistro/_replication'],

  // Job scheduler
  [/^\/_plugins\/_job_scheduler\b/, '/_opendistro/_job_scheduler'],
];

/**
 * Rewrite an OpenSearch plugin path to its OpenDistro equivalent.
 * Returns the original path if no rewrite applies (including for non-ES backends).
 */
export function rewritePluginPath(path: string, backend: BackendInfo): string {
  if (!path) return path;
  if (backend.distribution !== 'elasticsearch') return path;
  if (!backend.hasOpenDistro) return path;

  for (const [pattern, replacement] of PLUGIN_PATH_REWRITES) {
    if (pattern.test(path)) {
      return path.replace(pattern, replacement);
    }
  }
  return path;
}

/**
 * True if the path targets a plugin API (/_plugins/*).
 */
export function isPluginApiPath(path: string | undefined): boolean {
  return !!path && path.startsWith('/_plugins/');
}

/**
 * Request translator: rewrite /_plugins/* → /_opendistro/* when backend has OpenDistro.
 */
export function translateRequest(params: any, backend: BackendInfo): any {
  if (!params.path) return params;

  const rewritten = rewritePluginPath(params.path, backend);
  if (rewritten === params.path) return params;

  return { ...params, path: rewritten };
}
