#!/bin/bash
# Test 03: Document Operations
# Tests document CRUD, bulk, mget, delete_by_query
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../scripts/test_helpers.sh"

echo "═══ 03: Document Operations ═══"
detect_backend

INDEX="compat-test-docs"
H='-H Content-Type:application/json'

# Cleanup and create index
curl -s -X DELETE "http://$HOST/$INDEX" > /dev/null 2>&1 || true
if [ "$BACKEND_MAJOR" = "6" ]; then
  curl -s -X PUT "http://$HOST/$INDEX" $H -d '{"mappings":{"_doc":{"properties":{"title":{"type":"text"},"value":{"type":"integer"},"tag":{"type":"keyword"}}}}}' > /dev/null
else
  curl -s -X PUT "http://$HOST/$INDEX" $H -d '{"mappings":{"properties":{"title":{"type":"text"},"value":{"type":"integer"},"tag":{"type":"keyword"}}}}' > /dev/null
fi

echo ""
echo "── Index Document ──"

if [ "$BACKEND_MAJOR" = "6" ]; then
  assert_status "Index document with ID" PUT "/$INDEX/_doc/doc1?refresh=true" "201" \
    $H -d '{"title":"Test Document 1","value":42,"tag":"alpha"}'
else
  assert_status "Index document with ID" PUT "/$INDEX/_doc/doc1?refresh=true" "201" \
    $H -d '{"title":"Test Document 1","value":42,"tag":"alpha"}'
fi

echo ""
echo "── Get Document ──"

assert_status "Get document by ID" GET "/$INDEX/_doc/doc1" "200"
assert_json "Document has correct title" GET "/$INDEX/_doc/doc1" '._source.title' "Test Document 1"
assert_json "Document has _id" GET "/$INDEX/_doc/doc1" '._id' "doc1"

# Verify _type is handled correctly
if [ "$BACKEND_MAJOR" = "6" ]; then
  assert_json "ES 6.x returns _type" GET "/$INDEX/_doc/doc1" '._type' "_doc"
else
  # ES 7.x may or may not return _type depending on version
  assert_json "Document has _index" GET "/$INDEX/_doc/doc1" '._index' "$INDEX"
fi

echo ""
echo "── Update Document ──"

if [ "$BACKEND_MAJOR" = "6" ]; then
  assert_status "Update document" POST "/$INDEX/_doc/doc1/_update?refresh=true" "200" \
    $H -d '{"doc":{"value":99}}'
else
  assert_status "Update document" POST "/$INDEX/_update/doc1?refresh=true" "200" \
    $H -d '{"doc":{"value":99}}'
fi

assert_json "Document updated" GET "/$INDEX/_doc/doc1" '._source.value' "99"

echo ""
echo "── Delete Document ──"

# Index a doc to delete
if [ "$BACKEND_MAJOR" = "6" ]; then
  curl -s -X PUT "http://$HOST/$INDEX/_doc/doc_del?refresh=true" $H -d '{"title":"delete me"}' > /dev/null
else
  curl -s -X PUT "http://$HOST/$INDEX/_doc/doc_del?refresh=true" $H -d '{"title":"delete me"}' > /dev/null
fi

assert_status "Delete document" DELETE "/$INDEX/_doc/doc_del?refresh=true" "200"
assert_status "Deleted document returns 404" GET "/$INDEX/_doc/doc_del" "404"

echo ""
echo "── Bulk Operations ──"

if [ "$BACKEND_MAJOR" = "6" ]; then
  BULK_DATA='{"index":{"_index":"'"$INDEX"'","_type":"_doc","_id":"bulk1"}}
{"title":"Bulk Doc 1","value":1,"tag":"beta"}
{"index":{"_index":"'"$INDEX"'","_type":"_doc","_id":"bulk2"}}
{"title":"Bulk Doc 2","value":2,"tag":"beta"}
{"index":{"_index":"'"$INDEX"'","_type":"_doc","_id":"bulk3"}}
{"title":"Bulk Doc 3","value":3,"tag":"gamma"}
'
else
  BULK_DATA='{"index":{"_index":"'"$INDEX"'","_id":"bulk1"}}
{"title":"Bulk Doc 1","value":1,"tag":"beta"}
{"index":{"_index":"'"$INDEX"'","_id":"bulk2"}}
{"title":"Bulk Doc 2","value":2,"tag":"beta"}
{"index":{"_index":"'"$INDEX"'","_id":"bulk3"}}
{"title":"Bulk Doc 3","value":3,"tag":"gamma"}
'
fi

assert_status "Bulk index" POST "/_bulk?refresh=true" "200" \
  -H 'Content-Type: application/x-ndjson' -d "$BULK_DATA"

assert_json "Bulk doc 1 exists" GET "/$INDEX/_doc/bulk1" '._source.title' "Bulk Doc 1"
assert_json "Bulk doc 3 exists" GET "/$INDEX/_doc/bulk3" '._source.tag' "gamma"

echo ""
echo "── Multi-Get (mget) ──"

if [ "$BACKEND_MAJOR" = "6" ]; then
  assert_status "Mget returns 200" POST "/$INDEX/_mget" "200" \
    $H -d '{"docs":[{"_id":"doc1","_type":"_doc"},{"_id":"bulk1","_type":"_doc"}]}'
else
  assert_status "Mget returns 200" POST "/$INDEX/_mget" "200" \
    $H -d '{"docs":[{"_id":"doc1"},{"_id":"bulk1"}]}'
fi

assert_json "Mget returns 2 docs" POST "/$INDEX/_mget" '.docs | length' "2" \
  $H -d '{"docs":[{"_id":"doc1"},{"_id":"bulk1"}]}'

echo ""
echo "── Delete By Query ──"

assert_status "Delete by query" POST "/$INDEX/_delete_by_query?refresh=true" "200" \
  $H -d '{"query":{"term":{"tag":"beta"}}}'

assert_status "Deleted docs are gone" GET "/$INDEX/_doc/bulk1" "404"
assert_status "Non-matching doc still exists" GET "/$INDEX/_doc/bulk3" "200"

# Cleanup
curl -s -X DELETE "http://$HOST/$INDEX" > /dev/null 2>&1

print_summary
