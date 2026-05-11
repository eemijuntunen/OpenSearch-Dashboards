#!/bin/bash
# Wait for cluster to be ready
HOST="${1:-localhost:9200}"
MAX_WAIT="${2:-120}"

echo "Waiting for cluster at $HOST (max ${MAX_WAIT}s)..."
elapsed=0
while [ $elapsed -lt $MAX_WAIT ]; do
  if curl -sf "http://$HOST/_cluster/health" > /dev/null 2>&1; then
    echo "✅ Cluster ready (${elapsed}s)"
    curl -s "http://$HOST" | jq '{name: .name, version: .version.number, distribution: .version.distribution}'
    exit 0
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done
echo "❌ Cluster not ready after ${MAX_WAIT}s"
exit 1
