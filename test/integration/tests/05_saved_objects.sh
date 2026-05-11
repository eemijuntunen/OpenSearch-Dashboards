#!/bin/bash
# Test 05: Saved Objects Simulation
# Simulates OSD saved object operations (index pattern, search, viz, dashboard)
# These test the same APIs that OSD's saved object service uses
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../scripts/test_helpers.sh"

echo "═══ 05: Saved Objects Simulation ═══"
detect_backend

SO_INDEX=".kibana_compat_test"
H='-H Content-Type:application/json'

# Cleanup
curl -s -X DELETE "http://$HOST/$SO_INDEX" > /dev/null 2>&1 || true

# Create saved objects index (simulates .kibana)
if [ "$BACKEND_MAJOR" = "6" ]; then
  curl -s -X PUT "http://$HOST/$SO_INDEX" $H -d '{
    "mappings":{"_doc":{"dynamic":"strict","properties":{
      "type":{"type":"keyword"},
      "updated_at":{"type":"date"},
      "index-pattern":{"properties":{"title":{"type":"text"},"timeFieldName":{"type":"keyword"},"fields":{"type":"text"}}},
      "search":{"properties":{"title":{"type":"text"},"kibanaSavedObjectMeta":{"properties":{"searchSourceJSON":{"type":"text"}}}}},
      "visualization":{"properties":{"title":{"type":"text"},"visState":{"type":"text"}}},
      "dashboard":{"properties":{"title":{"type":"text"},"panelsJSON":{"type":"text"}}}
    }}}
  }' > /dev/null
else
  curl -s -X PUT "http://$HOST/$SO_INDEX" $H -d '{
    "mappings":{"dynamic":"strict","properties":{
      "type":{"type":"keyword"},
      "updated_at":{"type":"date"},
      "index-pattern":{"properties":{"title":{"type":"text"},"timeFieldName":{"type":"keyword"},"fields":{"type":"text"}}},
      "search":{"properties":{"title":{"type":"text"},"kibanaSavedObjectMeta":{"properties":{"searchSourceJSON":{"type":"text"}}}}},
      "visualization":{"properties":{"title":{"type":"text"},"visState":{"type":"text"}}},
      "dashboard":{"properties":{"title":{"type":"text"},"panelsJSON":{"type":"text"}}}
    }}
  }' > /dev/null
fi

echo ""
echo "── Create Saved Objects ──"

# Index pattern
assert_status "Create index pattern" PUT "/$SO_INDEX/_doc/index-pattern:test-pattern?refresh=true" "201" \
  $H -d '{"type":"index-pattern","index-pattern":{"title":"logs-*","timeFieldName":"@timestamp"},"updated_at":"2026-03-25T00:00:00Z"}'

# Saved search
assert_status "Create saved search" PUT "/$SO_INDEX/_doc/search:test-search?refresh=true" "201" \
  $H -d '{"type":"search","search":{"title":"Error Search","kibanaSavedObjectMeta":{"searchSourceJSON":"{\"query\":{\"match\":{\"level\":\"error\"}}}"}},"updated_at":"2026-03-25T00:00:00Z"}'

# Visualization
assert_status "Create visualization" PUT "/$SO_INDEX/_doc/visualization:test-viz?refresh=true" "201" \
  $H -d '{"type":"visualization","visualization":{"title":"Error Count","visState":"{\"type\":\"metric\",\"aggs\":[{\"type\":\"count\"}]}"},"updated_at":"2026-03-25T00:00:00Z"}'

# Dashboard
assert_status "Create dashboard" PUT "/$SO_INDEX/_doc/dashboard:test-dash?refresh=true" "201" \
  $H -d '{"type":"dashboard","dashboard":{"title":"Test Dashboard","panelsJSON":"[{\"panelIndex\":\"1\",\"type\":\"visualization\",\"id\":\"test-viz\"}]"},"updated_at":"2026-03-25T00:00:00Z"}'

echo ""
echo "── Read Saved Objects ──"

assert_json "Get index pattern" GET "/$SO_INDEX/_doc/index-pattern:test-pattern" \
  '._source.type' "index-pattern"
assert_json "Get saved search" GET "/$SO_INDEX/_doc/search:test-search" \
  '._source.search.title' "Error Search"
assert_json "Get visualization" GET "/$SO_INDEX/_doc/visualization:test-viz" \
  '._source.visualization.title' "Error Count"
assert_json "Get dashboard" GET "/$SO_INDEX/_doc/dashboard:test-dash" \
  '._source.dashboard.title' "Test Dashboard"

echo ""
echo "── Find Saved Objects (search) ──"

assert_json "Find by type" POST "/$SO_INDEX/_search" \
  '.hits.total.value // .hits.total' "1" \
  $H -d '{"query":{"term":{"type":"dashboard"}}}'

assert_json "Find all saved objects" POST "/$SO_INDEX/_search" \
  '.hits.total.value // .hits.total' "4" \
  $H -d '{"query":{"match_all":{}}}'

echo ""
echo "── Update Saved Object ──"

assert_status "Update dashboard title" POST "/$SO_INDEX/_doc/dashboard:test-dash/_update?refresh=true" "200" \
  $H -d '{"doc":{"dashboard":{"title":"Updated Dashboard"},"updated_at":"2026-03-25T01:00:00Z"}}'

assert_json "Dashboard title updated" GET "/$SO_INDEX/_doc/dashboard:test-dash" \
  '._source.dashboard.title' "Updated Dashboard"

echo ""
echo "── Bulk Get (mget) ──"

MGET_BODY='{"docs":[{"_id":"index-pattern:test-pattern"},{"_id":"visualization:test-viz"},{"_id":"dashboard:test-dash"}]}'
assert_json "Mget returns 3 saved objects" POST "/$SO_INDEX/_mget" \
  '.docs | length' "3" \
  $H -d "$MGET_BODY"

assert_json "Mget first doc found" POST "/$SO_INDEX/_mget" \
  '.docs[0].found' "true" \
  $H -d "$MGET_BODY"

echo ""
echo "── Delete Saved Object ──"

assert_status "Delete saved search" DELETE "/$SO_INDEX/_doc/search:test-search?refresh=true" "200"
assert_status "Deleted search returns 404" GET "/$SO_INDEX/_doc/search:test-search" "404"

assert_json "3 saved objects remain" POST "/$SO_INDEX/_search" \
  '.hits.total.value // .hits.total' "3" \
  $H -d '{"query":{"match_all":{}}}'

echo ""
echo "── Version / Concurrency ──"

# Get current version
DOC_RESPONSE=$(curl -s "http://$HOST/$SO_INDEX/_doc/dashboard:test-dash")
DOC_VERSION=$(echo "$DOC_RESPONSE" | jq -r '._version')
DOC_SEQ=$(echo "$DOC_RESPONSE" | jq -r '._seq_no // empty')
DOC_PTERM=$(echo "$DOC_RESPONSE" | jq -r '._primary_term // empty')

if [ -n "$DOC_SEQ" ] && [ "$DOC_SEQ" != "null" ]; then
  echo -e "  ${GREEN}✅ Document has _seq_no ($DOC_SEQ) and _primary_term ($DOC_PTERM)${NC}"
  PASS=$((PASS + 1))
elif [ "$BACKEND_MAJOR" = "6" ]; then
  echo -e "  ${YELLOW}⏭️  ES 6.x uses _version ($DOC_VERSION) — Transport synthesizes _seq_no${NC}"
  SKIP=$((SKIP + 1))
else
  echo -e "  ${RED}❌ Missing _seq_no on ES 7.x+${NC}"
  FAIL=$((FAIL + 1))
fi

# Cleanup
curl -s -X DELETE "http://$HOST/$SO_INDEX" > /dev/null 2>&1

print_summary
