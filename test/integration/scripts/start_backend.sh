#!/bin/bash
# Start a backend cluster for testing
# Usage: ./start_backend.sh es 6.8.23
#        ./start_backend.sh es 7.10.2
#        ./start_backend.sh os 2.19.0
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_DIR="$SCRIPT_DIR/.."
BACKEND="${1:?Usage: $0 <es|os> <version>}"
VERSION="${2:?Usage: $0 <es|os> <version>}"

# Stop any running test cluster
docker rm -f es-compat-test os-compat-test 2>/dev/null || true

echo "Starting $BACKEND $VERSION..."

if [ "$BACKEND" = "es" ]; then
  ES_VERSION="$VERSION" docker compose -f "$COMPOSE_DIR/docker-compose.es.yml" up -d
elif [ "$BACKEND" = "os" ]; then
  OS_VERSION="$VERSION" docker compose -f "$COMPOSE_DIR/docker-compose.os.yml" up -d
else
  echo "Unknown backend: $BACKEND (use 'es' or 'os')"
  exit 1
fi

"$SCRIPT_DIR/wait_for_cluster.sh" localhost:9200 120
