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
ALL=(auth:8081 platform-service:8089 shared-service:8082 waiting-on:8083 consent-gateway:8084 home-pulse:8085 ask-your-life:8086 digital-legacy:8087 family-treasury:8088 gateway:8080)

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
export TEMPORAL_ENABLED="${TEMPORAL_ENABLED:-true}"   # the compose file starts a Temporal dev server on :7233; set false to run without

wanted=("$@")
for entry in "${ALL[@]}"; do
  name="${entry%%:*}"
  if [ ${#wanted[@]} -gt 0 ] && [[ ! " ${wanted[*]} " =~ " $name " ]]; then continue; fi
  jar="$(ls "$ROOT/$name"/target/*-SNAPSHOT.jar 2>/dev/null | head -1 || true)"
  [ -n "$jar" ] || { echo "no jar for $name: run ./mvnw -DskipTests package" >&2; exit 1; }
  start "$name" java -jar "$jar"
done
echo "logs: $STATE/logs/<name>.log   stop: dev/down.sh"
