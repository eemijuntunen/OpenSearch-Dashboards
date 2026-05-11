#!/bin/bash
# Run all integration tests against the current cluster
# Usage: ./run_tests.sh [test_number]
# Example: ./run_tests.sh        (run all)
#          ./run_tests.sh 03     (run only test 03)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_DIR="$SCRIPT_DIR/../tests"
RESULTS_DIR="$SCRIPT_DIR/../results"
HOST="${CLUSTER_HOST:-localhost:9200}"

mkdir -p "$RESULTS_DIR"

# Verify cluster is up
echo "Checking cluster at $HOST..."
if ! curl -sf "http://$HOST" > /dev/null 2>&1; then
  echo "❌ Cluster not reachable at $HOST"
  exit 1
fi

# Get backend info for report
BACKEND_INFO=$(curl -s "http://$HOST")
BACKEND_VERSION=$(echo "$BACKEND_INFO" | jq -r '.version.number')
BACKEND_DIST=$(echo "$BACKEND_INFO" | jq -r '.version.distribution // "elasticsearch"')
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="$RESULTS_DIR/${BACKEND_DIST}_${BACKEND_VERSION}_${TIMESTAMP}.txt"

echo "═══════════════════════════════════════════════════"
echo "  Backend: $BACKEND_DIST $BACKEND_VERSION"
echo "  Time:    $(date)"
echo "═══════════════════════════════════════════════════"
echo ""

# Run tests
TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0

{
  echo "Backend: $BACKEND_DIST $BACKEND_VERSION"
  echo "Date: $(date)"
  echo "Host: $HOST"
  echo ""

  if [ -n "$1" ]; then
    # Run specific test
    TESTS=("$TEST_DIR/${1}*.sh")
  else
    # Run all tests in order
    TESTS=("$TEST_DIR"/[0-9]*.sh)
  fi

  for test_file in "${TESTS[@]}"; do
    if [ ! -f "$test_file" ]; then
      echo "Test not found: $test_file"
      continue
    fi
    echo ""
    bash "$test_file" 2>&1
    echo ""
  done
} 2>&1 | tee "$REPORT_FILE"

echo ""
echo "Report saved to: $REPORT_FILE"
