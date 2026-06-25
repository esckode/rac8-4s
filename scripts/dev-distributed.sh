#!/usr/bin/env bash
# scripts/dev-distributed.sh — boot the distributed dev stack
#
# Starts:
#   • nginx load balancer on :4000 (Docker, round-robin to :3001/:3002)
#   • API instance A on :3001  (SSE_BUS=redis JOB_QUEUE=bullmq TOKEN_STORE=redis)
#   • API instance B on :3002  (same, different PORT)
#   • BullMQ worker
#
# All three node processes share the same DATABASE_URL, REDIS_URL, and JWT_SECRET.
# On CTRL-C the script kills all child processes and tears down the LB container.
#
# Usage:
#   npm run dev:distributed
#   npm run dev:distributed:down   # stop only the LB container

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$REPO_ROOT/packages/api"
ENV_FILE="$API_DIR/.env"

# ── Load base env from packages/api/.env ─────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  # Export vars without overriding already-set env vars
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# ── Distributed-specific env overrides ───────────────────────────────────────
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export SSE_BUS=redis
export JOB_QUEUE=bullmq
export TOKEN_STORE=redis
export NODE_ENV="${NODE_ENV:-development}"
# Shared JWT_SECRET — must be the same on both instances for organizer JWTs to work
export JWT_SECRET="${JWT_SECRET:-dev-secret-key-change-in-production}"

echo "🔧  Distributed stack env:"
echo "    DATABASE_URL  = ${DATABASE_URL:-<not set>}"
echo "    REDIS_URL     = $REDIS_URL"
echo "    JWT_SECRET    = ${JWT_SECRET:0:6}…"
echo "    SSE_BUS       = $SSE_BUS"
echo "    JOB_QUEUE     = $JOB_QUEUE"
echo "    TOKEN_STORE   = $TOKEN_STORE"
echo ""

# ── Start nginx LB (Docker) ───────────────────────────────────────────────────
echo "🚀  Starting nginx LB on :4000 …"
docker compose \
  -f "$REPO_ROOT/docker-compose.yml" \
  -f "$REPO_ROOT/docker-compose.distributed.yml" \
  up -d lb

echo "✅  LB running — health check …"
for i in $(seq 1 15); do
  if curl -sf http://localhost:4000/health >/dev/null 2>&1; then
    echo "    LB OK"
    break
  fi
  if [[ $i -eq 15 ]]; then
    echo "    ⚠️  LB health check timed out (API instances may not be up yet — that's fine)"
  fi
  sleep 1
done

# ── Cleanup on exit ───────────────────────────────────────────────────────────
PIDS=()

cleanup() {
  echo ""
  echo "⏹️   Shutting down API instances and worker …"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait "${PIDS[@]}" 2>/dev/null || true
  echo "⏹️   Stopping nginx LB container …"
  docker compose \
    -f "$REPO_ROOT/docker-compose.yml" \
    -f "$REPO_ROOT/docker-compose.distributed.yml" \
    stop lb 2>/dev/null || true
  echo "✅  Distributed stack stopped."
}

trap cleanup EXIT INT TERM

# ── Start API instance A (:3001) ─────────────────────────────────────────────
echo "🚀  Starting API instance A on :3001 …"
PORT=3001 npx --prefix "$API_DIR" tsx src/server.ts &
PIDS+=($!)

# ── Start API instance B (:3002) ─────────────────────────────────────────────
echo "🚀  Starting API instance B on :3002 …"
PORT=3002 npx --prefix "$API_DIR" tsx src/server.ts &
PIDS+=($!)

# ── Start BullMQ worker ───────────────────────────────────────────────────────
echo "🚀  Starting BullMQ worker …"
npx --prefix "$API_DIR" tsx src/worker-entrypoint.ts &
PIDS+=($!)

echo ""
echo "📡  Distributed stack booting …"
echo "    Load balancer (nginx)  : http://localhost:4000"
echo "    API instance A         : http://localhost:3001"
echo "    API instance B         : http://localhost:3002"
echo ""
echo "    Run multi-instance e2e:"
echo "    npx playwright test --config playwright.config.multi-instance.ts --retries=2"
echo ""
echo "    CTRL-C to stop all processes."
echo ""

# Wait for all child processes (keeps the script alive)
wait "${PIDS[@]}"
