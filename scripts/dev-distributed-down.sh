#!/usr/bin/env bash
# scripts/dev-distributed-down.sh — stop only the LB container
# (API and worker processes are stopped by CTRL-C in dev-distributed.sh)
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
docker compose \
  -f "$REPO_ROOT/docker-compose.yml" \
  -f "$REPO_ROOT/docker-compose.distributed.yml" \
  stop lb
echo "✅  nginx LB container stopped."
