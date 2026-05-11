#!/bin/bash
# Test 04: Search Operations
# Tests search, msearch, scroll, aggregations, query types
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../scripts/test_helpers.sh"

echo "═══ 04: Search Operations ═══"
detect_backend

INDEX="compat-test-search"
H='-H Content-Type:application/json'

# Setup: create index and seed data
curl -s -X DELETE "http://$HOST/$INDEX" > /dev/null 2>&1 || true

if [ "$BACKEND_MAJOR" = "6" ]; then
  curl -s -X PUT "http://$HOST/$INDEX" $H -d '{"mappings":{"_doc":{"properties":{"title":{"type":"text"},"status":{"type":"keyword"},"value":{"type":"integer"},"created":{"type":"date"}}}}}' > /dev/null
  BULK='{"index":{"_index":"'"$INDEX"'","_type":"_doc","_id":"s1"}}
{"title":"Error in production","status":"critical","value":10,"created":"2026-03-01T00:00:00Z"}
{"index":{"_index":"'"$INDEX"'","_type":"_doc","_id":"s2"}}
{"title":"Warning in staging","status":"warning","value":5,"created":"2026-03-02T00:00:00Z"}
{"index":{"_index":"'"$INDEX"'","_type":"_doc","_id":"s3"}}
{"title":"Info message","status":"info","value":1,"created":"2026-03-03T00:00:00Z"}
{"index":{"_index":"'"$INDEX"'","_type":"_doc","_id":"s4"}}
{"title":"Another error found","status":"critical","value":20,"created":"2026-03-04T00:00:00Z"}
{"index":{"_index":"'"$INDEX"'","_type":"_doc","_id":"s5"}}
{"title":"Debug trace log","status":"info","value":0,"created":"2026-03-05T00:00:00Z"}
'
else
  curl -s -X PUT "http://$HOST/$INDEX" $H -d '{"mappings":{"properties":{"title":{"type":"text"},"status":{"type":"keyword"},"value":{"type":"integer"},"created":{"type":"date"}}}}' > /dev/null
  BULK='{"index":{"_index":"'"$INDEX"'","_id":"s1"}}
{"title":"Error in production","status":"critical","value":10,"created":"2026-03-01T00:00:00Z"}
{"index":{"_index":"'"$INDEX"'","_id":"s2"}}
{"title":"Warning in staging","status":"warning","value":5,"created":"2026-03-02T00:00:00Z"}
{"index":{"_index":"'"$INDEX"'","_id":"s3"}}
{"title":"Info message","status":"info","value":1,"created":"2026-03-03T00:00:00Z"}
{"index":{"_index":"'"$INDEX"'","_id":"s4"}}
{"title":"Another error found","status":"critical","value":20,"created":"2026-03-04T00:00:00Z"}
{"index":{"_index":"'"$INDEX"'","_id":"s5"}}
{"title":"Debug trace log","status":"info","value":0,"created":"2026-03-05T00:00:00Z"}
'
fi

curl -s -X POST "http://$HOST/_bulk?refresh=true" -H 'Content-Type: application/x-ndjson' -d "$BULK" > /dev/null

echo ""
echo "── Basic Search ──"

assert_status "Match all search" POST "/$INDEX/_search" "200" \
  $H -d '{"query":{"match_all":{}}}'

assert_json "Match all returns 5 hits" POST "/$INDEX/_search" \
  '.hits.total.value // .hits.total' "5" \
  $H -d '{"query":{"match_all":{}}}'

assert_json "Match query works" POST "/$INDEX/_search" \
  '.hits.total.value // .hits.total' "2" \
  $H -d '{"query":{"match":{"title":"error"}}}'

echo ""
echo "── Bool Query ──"

assert_json "Bool must + filter" POST "/$INDEX/_search" \
  '.hits.total.value // .hits.total' "1" \
  $H -d '{"query":{"bool":{"must":[{"match":{"title":"error"}}],"filter":[{"term":{"status":"critical"}},{"range":{"value":{"gte":15}}}]}}}'

assert_json "Bool should with minimum_should_match" POST "/$INDEX/_search" \
  '.hits.total.value // .hits.total | . > 0' "true" \
  $H -d '{"query":{"bool":{"should":[{"term":{"status":"critical"}},{"term":{"status":"warning"}}],"minimum_should_match":1}}}'

echo ""
echo "── Aggregations ──"

assert_json "Terms aggregation" POST "/$INDEX/_search?size=0" \
  '.aggregations.statuses.buckets | length' "3" \
  $H -d '{"size":0,"aggs":{"statuses":{"terms":{"field":"status"}}}}'

assert_json "Date histogram (interval)" POST "/$INDEX/_search?size=0" \
  '.aggregations.over_time.buckets | length | . > 0' "true" \
  $H -d '{"size":0,"aggs":{"over_time":{"date_histogram":{"field":"created","interval":"day"}}}}'

if [ "$BACKEND_MAJOR" != "6" ]; then
  assert_json "Date histogram (calendar_interval)" POST "/$INDEX/_search?size=0" \
    '.aggregations.over_time.buckets | length | . > 0' "true" \
    $H -d '{"size":0,"aggs":{"over_time":{"date_histogram":{"field":"created","calendar_interval":"day"}}}}'
else
  skip_test "Date histogram (calendar_interval)" "ES 6.x uses 'interval' not 'calendar_interval'"
fi

assert_json "Stats aggregation" POST "/$INDEX/_search?size=0" \
  '.aggregations.value_stats.count' "5" \
  $H -d '{"size":0,"aggs":{"value_stats":{"stats":{"field":"value"}}}}'

assert_json "Nested aggs (terms + avg)" POST "/$INDEX/_search?size=0" \
  '.aggregations.by_status.buckets[0] | has("avg_value")' "true" \
  $H -d '{"size":0,"aggs":{"by_status":{"terms":{"field":"status"},"aggs":{"avg_value":{"avg":{"field":"value"}}}}}}'

echo ""
echo "── hits.total Format ──"

TOTAL_RESPONSE=$(curl -s -X POST "http://$HOST/$INDEX/_search" $H -d '{"query":{"match_all":{}}}')
if echo "$TOTAL_RESPONSE" | jq -e '.hits.total | type == "object"' > /dev/null 2>&1; then
  echo -e "  ${GREEN}✅ hits.total is object format${NC}"
  PASS=$((PASS + 1))
elif echo "$TOTAL_RESPONSE" | jq -e '.hits.total | type == "number"' > /dev/null 2>&1; then
  if [ "$BACKEND_MAJOR" = "6" ]; then
    echo -e "  ${YELLOW}⏭️  hits.total is number (expected for raw ES 6.x, Transport normalizes this)${NC}"
    SKIP=$((SKIP + 1))
  else
    echo -e "  ${RED}❌ hits.total should be object on ES 7.x+${NC}"
    FAIL=$((FAIL + 1))
  fi
fi

echo ""
echo "── Multi-Search (msearch) ──"

MSEARCH_BODY='{"index":"'"$INDEX"'"}
{"query":{"match":{"title":"error"}}}
{"index":"'"$INDEX"'"}
{"query":{"term":{"status":"info"}}}
'

assert_status "Msearch returns 200" POST "/_msearch" "200" \
  -H 'Content-Type: application/x-ndjson' -d "$MSEARCH_BODY"

assert_json "Msearch returns 2 responses" POST "/_msearch" \
  '.responses | length' "2" \
  -H 'Content-Type: application/x-ndjson' -d "$MSEARCH_BODY"

echo ""
echo "── Scroll Search ──"

SCROLL_RESPONSE=$(curl -s -X POST "http://$HOST/$INDEX/_search?scroll=1m" $H -d '{"size":2,"query":{"match_all":{}}}')
SCROLL_ID=$(echo "$SCROLL_RESPONSE" | jq -r '._scroll_id')

if [ "$SCROLL_ID" != "null" ] && [ -n "$SCROLL_ID" ]; then
  echo -e "  ${GREEN}✅ Scroll search returns scroll_id${NC}"
  PASS=$((PASS + 1))

  assert_json "Scroll returns 2 hits" POST "/$INDEX/_search?scroll=1m" \
    '.hits.hits | length' "2" \
    $H -d '{"size":2,"query":{"match_all":{}}}'

  # Continue scroll
  SCROLL_CONT=$(curl -s -X POST "http://$HOST/_search/scroll" $H -d "{\"scroll\":\"1m\",\"scroll_id\":\"$SCROLL_ID\"}")
  CONT_HITS=$(echo "$SCROLL_CONT" | jq '.hits.hits | length')
  if [ "$CONT_HITS" -gt 0 ] 2>/dev/null; then
    echo -e "  ${GREEN}✅ Scroll continuation returns more hits ($CONT_HITS)${NC}"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}❌ Scroll continuation returned 0 hits${NC}"
    FAIL=$((FAIL + 1))
  fi

  # Clear scroll
  curl -s -X DELETE "http://$HOST/_search/scroll" $H -d "{\"scroll_id\":\"$SCROLL_ID\"}" > /dev/null 2>&1
else
  echo -e "  ${RED}❌ Scroll search did not return scroll_id${NC}"
  FAIL=$((FAIL + 1))
fi

# Cleanup
curl -s -X DELETE "http://$HOST/$INDEX" > /dev/null 2>&1

print_summary
