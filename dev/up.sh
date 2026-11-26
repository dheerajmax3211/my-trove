#!/usr/bin/env bash
# Start the dev identity provider and every backend service (and the gateway, the single public entrance on :8080)
# against the dev database.
#   dev/up.sh            all services
#   dev/up.sh auth shared-service     just these
# Needs: dev database running (docker compose -f dev/docker-compose.yml up -d) and built jars
# (./mvnw -DskipTests package). Logs and pids live in dev/.state/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$ROOT/dev/.state"
mkdir -p "$STATE/logs" "$STATE/pids" "$STATE/blobs"

# service:port, in start order
ALL=(auth:8081 platform-service:8089 shared-service:8082 waiting-on:8083 consent-gateway:8084 home-pulse:8085 ask-your-life:8086 digital-legacy:8087 family-treasury:8088 mcp-server:8090 gateway:8080)

secret() { # secret <name>: a random value, created once and reused so restarts keep working
  local f="$STATE/$1"
  [ -s "$f" ] || { openssl rand -base64 32 | tr -d '\n' > "$f"; chmod 600 "$f"; }
  cat "$f"
}

start() { # start <name> <cmd...>; skips when already running
  local name="$1"; shift
  local pidfile="$STATE/pids/$name.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then echo "$name already running"; return; fi
  nohup "$@" > "$STATE/logs/$name.log" 2>&1 &
  echo $! > "$pidfile"
  echo "started $name (pid $!)"
}

if [ "${REAL_FIREBASE:-0}" = 1 ]; then
  # Real Firebase: services verify tokens against Google's keys. Needs your project id and your own email as admin.
  : "${FIREBASE_PROJECT_ID:?REAL_FIREBASE=1 needs FIREBASE_PROJECT_ID (see dev/FIREBASE.md)}"
  : "${BOOTSTRAP_ADMIN_EMAILS:?REAL_FIREBASE=1 needs BOOTSTRAP_ADMIN_EMAILS (the Google account you will sign in with)}"
  unset APP_FIREBASE_JWK_SET_URI
else
  start dev-idp node "$ROOT/dev/dev-idp.mjs"
  export FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-demo-platform}"
  export APP_FIREBASE_JWK_SET_URI="${APP_FIREBASE_JWK_SET_URI:-http://localhost:9100/jwks}"
  export BOOTSTRAP_ADMIN_EMAILS="${BOOTSTRAP_ADMIN_EMAILS:-dev@example.test}"
fi
export DB_URL="${DB_URL:-jdbc:postgresql://localhost:5433/platform}"
# Eight services share one Postgres (max_connections 100): keep each pool small so psql and tools can still connect.
export SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE="${SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE:-4}"
export CONSENT_KEY_ENCRYPTION_KEY="$(secret consent-kek)"
export FILE_TOKEN_SECRET="$(secret file-token-secret)"
export FILES_ROOT="$STATE/blobs"
export INBOUND_WEBHOOK_SECRET="$(secret inbound-secret)"
# Platform layer: every service verifies platform tokens issued by auth (the gateway exchanges the Firebase token);
# auth itself accepts both kinds. platform-service and the gateway share an internal key for /internal/** calls.
export APP_SECURITY_MODE=platform
export APP_PLATFORM_JWK_SET_URI="${APP_PLATFORM_JWK_SET_URI:-http://localhost:8081/.well-known/jwks.json}"
export APP_PLATFORM_KEY_ENCRYPTION_KEY="$(secret platform-kek)"
export APP_PLATFORM_ACCEPT_PLATFORM_TOKENS=true
export APP_INTERNAL_API_KEY="$(secret internal-api-key)"
export GATEWAY_INTERNAL_API_KEY="$APP_INTERNAL_API_KEY"
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:--Xmx512m}"
# Email goes to Mailpit (dev/docker-compose.yml): SMTP localhost:1025, inbox UI http://localhost:8025.
export MAIL_ENABLED="${MAIL_ENABLED:-true}"
export MAIL_HOST="${MAIL_HOST:-localhost}"
export MAIL_PORT="${MAIL_PORT:-1025}"
export MAIL_PUBLIC_BASE_URL="${MAIL_PUBLIC_BASE_URL:-http://localhost:5190}"
# Waiting On receives replies by real SMTP on localhost:2525 (receive-only; only open items' reply addresses).
export INBOUND_SMTP_ENABLED="${INBOUND_SMTP_ENABLED:-true}"
export INBOUND_SMTP_PORT="${INBOUND_SMTP_PORT:-2525}"
export TEMPORAL_ENABLED="${TEMPORAL_ENABLED:-true}"   # the compose file starts a Temporal dev server on :7233; set false to run without

# Management (actuator/prometheus) port is main port + 1000; every service exports traces to the local Jaeger.
export OTLP_TRACES_ENDPOINT="${OTLP_TRACES_ENDPOINT:-http://localhost:4318/v1/traces}"
# Dev only: publish http_server_requests_seconds_bucket so the Grafana p95 panel has data. Boot does not publish
# histogram buckets by default. The name follows Boot's env rule (dashes removed: percentiles-histogram becomes
# PERCENTILESHISTOGRAM). Whether production does is the owner's decision, so no application config is changed.
export MANAGEMENT_METRICS_DISTRIBUTION_PERCENTILESHISTOGRAM_HTTP_SERVER_REQUESTS=true

# Ask Your Life's local embedding model (pinned, checksum-verified, fetched once; see ask-your-life/model/fetch-model.sh).
# Without it the service still starts, on the lexical hashing fallback (WARN in its log and /actuator/health).
if [ "${#@}" -eq 0 ] || [[ " $* " =~ " ask-your-life " ]]; then
  "$ROOT/ask-your-life/model/fetch-model.sh" || echo "warning: could not fetch the Ask Your Life model; it will fall back to hashing" >&2
fi
export EMBEDDER_MODEL_DIR="${EMBEDDER_MODEL_DIR:-$ROOT/ask-your-life/model/potion-base-2M}"

wanted=("$@")
for entry in "${ALL[@]}"; do
  name="${entry%%:*}"
  export MANAGEMENT_PORT=$(( ${entry##*:} + 1000 ))
  # mcp-server's management port is 9090 in containers, but on this host the dev Prometheus already publishes 9090.
  if [ "$name" = mcp-server ]; then export MANAGEMENT_PORT=9190; fi
  if [ ${#wanted[@]} -gt 0 ] && [[ ! " ${wanted[*]} " =~ " $name " ]]; then continue; fi
  jar="$(ls "$ROOT/$name"/target/*-SNAPSHOT.jar 2>/dev/null | head -1 || true)"
  [ -n "$jar" ] || { echo "no jar for $name: run ./mvnw -DskipTests package" >&2; exit 1; }
  start "$name" java -jar "$jar"
done
echo "logs: $STATE/logs/<name>.log   stop: dev/down.sh"
