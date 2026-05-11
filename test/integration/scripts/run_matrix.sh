#!/bin/bash
# Run integration tests against all backends in the test matrix
# Usage: ./run_matrix.sh [--skip-os] [--skip-es6] [--skip-es7]
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/../results"

mkdir -p "$RESULTS_DIR"

SKIP_OS=false
SKIP_ES6=false
SKIP_ES7=false

for arg in "$@"; do
  case $arg in
    --skip-os)  SKIP_OS=true ;;
    --skip-es6) SKIP_ES6=true ;;
    --skip-es7) SKIP_ES7=true ;;
  esac
done

# Define test matrix
declare -a MATRIX
if [ "$SKIP_ES6" = false ]; then
  MATRIX+=("es:6.8.23")
fi
if [ "$SKIP_ES7" = false ]; then
  MATRIX+=("es:7.0.0" "es:7.10.2")
fi
if [ "$SKIP_OS" = false ]; then
  MATRIX+=("os:1.3.18" "os:2.19.0")
fi

SUMMARY_FILE="$RESULTS_DIR/matrix_$(date +%Y%m%d_%H%M%S).txt"

echo "═══════════════════════════════════════════════════"
echo "  Integration Test Matrix"
echo "  Backends: ${#MATRIX[@]}"
echo "  Time:     $(date)"
echo "═══════════════════════════════════════════════════"
echo ""

{
  for entry in "${MATRIX[@]}"; do
    BACKEND="${entry%%:*}"
    VERSION="${entry##*:}"

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Starting $BACKEND $VERSION"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    "$SCRIPT_DIR/start_backend.sh" "$BACKEND" "$VERSION"
    echo ""
    "$SCRIPT_DIR/run_tests.sh"
    echo ""

    # Stop cluster
    docker rm -f es-compat-test os-compat-test 2>/dev/null || true
    echo ""
    echo "Waiting 5s before next backend..."
    sleep 5
  done

  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "  Matrix complete. Results in: $RESULTS_DIR/"
  echo "═══════════════════════════════════════════════════"
} 2>&1 | tee "$SUMMARY_FILE"
