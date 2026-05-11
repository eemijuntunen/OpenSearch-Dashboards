#!/bin/bash
# Test 01: Backend Detection
# Verifies the cluster responds correctly and we can identify the backend
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../scripts/test_helpers.sh"

echo "═══ 01: Backend Detection ═══"
detect_backend

assert_status "Cluster responds to GET /" GET "/" "200"
assert_json "Version number is present" GET "/" '.version.number' "$BACKEND_VERSION"
assert_json "Cluster name is present" GET "/" '.cluster_name | length > 0' "true"
assert_status "Cluster health endpoint works" GET "/_cluster/health" "200"
assert_json "Cluster health is green or yellow" GET "/_cluster/health" '.status | test("green|yellow")' "true"

if [ "$BACKEND_DIST" = "opensearch" ]; then
  assert_json "OpenSearch distribution field present" GET "/" '.version.distribution' "opensearch"
else
  assert_json "No distribution field (Elasticsearch)" GET "/" '.version.distribution' "null"
fi

# Cat APIs
assert_status "Cat indices works" GET "/_cat/indices?format=json" "200"
assert_status "Cat health works" GET "/_cat/health?format=json" "200"
assert_status "Cat nodes works" GET "/_cat/nodes?format=json" "200"

if [ "$BACKEND_DIST" != "opensearch" ]; then
  assert_status "Cat plugins works" GET "/_cat/plugins?format=json" "200"
fi

print_summary
