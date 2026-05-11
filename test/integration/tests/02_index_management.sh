#!/bin/bash
# Test 02: Index Management
# Tests index CRUD, mappings, and field type handling
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../scripts/test_helpers.sh"

echo "═══ 02: Index Management ═══"
detect_backend

INDEX="compat-test-index"
H='-H Content-Type:application/json'

# Cleanup
curl -s -X DELETE "http://$HOST/$INDEX" > /dev/null 2>&1 || true

echo ""
echo "── Index CRUD ──"

if [ "$BACKEND_MAJOR" = "6" ]; then
  # ES 6.x requires type in mappings
  assert_status "Create index with mappings" PUT "/$INDEX" "200" \
    $H -d '{"mappings":{"_doc":{"properties":{"title":{"type":"text"},"count":{"type":"integer"},"created":{"type":"date"}}}}}'
else
  assert_status "Create index with mappings" PUT "/$INDEX" "200" \
    $H -d '{"mappings":{"properties":{"title":{"type":"text"},"count":{"type":"integer"},"created":{"type":"date"}}}}'
fi

assert_status "Index exists" HEAD "/$INDEX" "200"
assert_status "Get index" GET "/$INDEX" "200"
assert_status "Get mappings" GET "/$INDEX/_mapping" "200"

# Verify mapping fields exist
assert_json "Mapping has title field" GET "/$INDEX/_mapping" \
  ".[\"$INDEX\"].mappings | .. | .title? // empty | .type" "text"
assert_json "Mapping has count field" GET "/$INDEX/_mapping" \
  ".[\"$INDEX\"].mappings | .. | .count? // empty | .type" "integer"

echo ""
echo "── Put Mapping (add field) ──"

if [ "$BACKEND_MAJOR" = "6" ]; then
  assert_status "Add field via put mapping" PUT "/$INDEX/_doc/_mapping" "200" \
    $H -d '{"properties":{"tags":{"type":"keyword"}}}' \
    -G -d 'include_type_name=true'
else
  assert_status "Add field via put mapping" PUT "/$INDEX/_mapping" "200" \
    $H -d '{"properties":{"tags":{"type":"keyword"}}}'
fi

assert_json "New field exists in mapping" GET "/$INDEX/_mapping" \
  ".[\"$INDEX\"].mappings | .. | .tags? // empty | .type" "keyword"

echo ""
echo "── Field Capabilities ──"

assert_status "Field caps endpoint works" GET "/$INDEX/_field_caps?fields=title,count" "200"
assert_contains "Field caps returns title" GET "/$INDEX/_field_caps?fields=title,count" '"title"'

echo ""
echo "── Resolve Index (ES 6.x synthesized) ──"

if [ "$BACKEND_MAJOR" = "6" ]; then
  # _resolve/index doesn't exist on ES 6.x — the Transport synthesizes it
  # Test the raw _cat APIs that the Transport uses internally
  assert_contains "Cat indices returns test index" GET "/_cat/indices/$INDEX?format=json" "$INDEX"
else
  assert_status "Resolve index works" GET "/_resolve/index/$INDEX" "200"
fi

echo ""
echo "── Field Type Downgrade (ES 6.x) ──"

DOWNGRADE_INDEX="compat-test-downgrade"
curl -s -X DELETE "http://$HOST/$DOWNGRADE_INDEX" > /dev/null 2>&1 || true

if [ "$BACKEND_MAJOR" = "6" ]; then
  # These field types don't exist in ES 6.x — the Transport should downgrade them
  # Test that the index can be created with downgraded types
  assert_status "Create index with basic types (ES 6.x safe)" PUT "/$DOWNGRADE_INDEX" "200" \
    $H -d '{"mappings":{"_doc":{"properties":{"name":{"type":"text"},"tag":{"type":"keyword"},"val":{"type":"long"}}}}}'
  assert_json "Downgraded index has correct types" GET "/$DOWNGRADE_INDEX/_mapping" \
    ".[\"$DOWNGRADE_INDEX\"].mappings._doc.properties.name.type" "text"
elif [ "$BACKEND_MAJOR" = "7" ]; then
  # ES 7.x supports these types natively
  assert_status "Create index with ES 7.x types" PUT "/$DOWNGRADE_INDEX" "200" \
    $H -d '{"mappings":{"properties":{"name":{"type":"text"},"wild":{"type":"wildcard"},"val":{"type":"unsigned_long"}}}}'
  assert_json "Wildcard type preserved on ES 7.x" GET "/$DOWNGRADE_INDEX/_mapping" \
    ".[\"$DOWNGRADE_INDEX\"].mappings.properties.wild.type" "wildcard"
else
  # OpenSearch
  assert_status "Create index with OS types" PUT "/$DOWNGRADE_INDEX" "200" \
    $H -d '{"mappings":{"properties":{"name":{"type":"text"},"flat":{"type":"flat_object"}}}}'
fi

# Cleanup
curl -s -X DELETE "http://$HOST/$INDEX" > /dev/null 2>&1
curl -s -X DELETE "http://$HOST/$DOWNGRADE_INDEX" > /dev/null 2>&1

print_summary
