#!/bin/bash
# Test helper functions
HOST="${CLUSTER_HOST:-localhost:9200}"
PASS=0
FAIL=0
SKIP=0
ERRORS=""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

assert_status() {
  local desc="$1" method="$2" path="$3" expected="$4"
  shift 4
  local actual
  actual=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "http://$HOST$path" "$@")
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✅ $desc${NC} ($actual)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}❌ $desc${NC} (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
    ERRORS="$ERRORS\n  - $desc: expected $expected, got $actual"
  fi
}

assert_json() {
  local desc="$1" method="$2" path="$3" jq_filter="$4" expected="$5"
  shift 5
  local response actual
  response=$(curl -s -X "$method" "http://$HOST$path" "$@")
  actual=$(echo "$response" | jq -r "$jq_filter" 2>/dev/null)
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}✅ $desc${NC} ($actual)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}❌ $desc${NC} (expected '$expected', got '$actual')"
    FAIL=$((FAIL + 1))
    ERRORS="$ERRORS\n  - $desc: expected '$expected', got '$actual'"
  fi
}

assert_json_not() {
  local desc="$1" method="$2" path="$3" jq_filter="$4" not_expected="$5"
  shift 5
  local response actual
  response=$(curl -s -X "$method" "http://$HOST$path" "$@")
  actual=$(echo "$response" | jq -r "$jq_filter" 2>/dev/null)
  if [ "$actual" != "$not_expected" ]; then
    echo -e "  ${GREEN}✅ $desc${NC} ($actual != $not_expected)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}❌ $desc${NC} (got '$actual', should not be '$not_expected')"
    FAIL=$((FAIL + 1))
    ERRORS="$ERRORS\n  - $desc: got '$actual', should not be '$not_expected'"
  fi
}

assert_contains() {
  local desc="$1" method="$2" path="$3" substring="$4"
  shift 4
  local response
  response=$(curl -s -X "$method" "http://$HOST$path" "$@")
  if echo "$response" | grep -q "$substring"; then
    echo -e "  ${GREEN}✅ $desc${NC}"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}❌ $desc${NC} (response missing '$substring')"
    FAIL=$((FAIL + 1))
    ERRORS="$ERRORS\n  - $desc: response missing '$substring'"
  fi
}

skip_test() {
  local desc="$1" reason="$2"
  echo -e "  ${YELLOW}⏭️  $desc${NC} (skipped: $reason)"
  SKIP=$((SKIP + 1))
}

# Detect backend for conditional tests
detect_backend() {
  local info
  info=$(curl -s "http://$HOST")
  BACKEND_VERSION=$(echo "$info" | jq -r '.version.number')
  BACKEND_DIST=$(echo "$info" | jq -r '.version.distribution // "elasticsearch"')
  BACKEND_MAJOR=$(echo "$BACKEND_VERSION" | cut -d. -f1)
  echo "Backend: $BACKEND_DIST $BACKEND_VERSION (major: $BACKEND_MAJOR)"
}

print_summary() {
  local total=$((PASS + FAIL + SKIP))
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "  ${GREEN}Passed: $PASS${NC}  ${RED}Failed: $FAIL${NC}  ${YELLOW}Skipped: $SKIP${NC}  Total: $total"
  if [ $FAIL -gt 0 ]; then
    echo -e "\n  Failures:$ERRORS"
  fi
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  return $FAIL
}
