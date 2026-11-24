#!/usr/bin/env bash
# End-to-end proof of the observability stack. Needs dev/up.sh and
# `docker compose -f dev/docker-compose.yml --profile observability up -d` running.
# Sends traffic through the gateway, waits, then asserts Prometheus, Jaeger and every dashboard panel have data.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATEWAY="${GATEWAY_URL:-http://localhost:8080}"
PROM="${PROM_URL:-http://localhost:9090}"
JAEGER="${JAEGER_URL:-http://localhost:16686}"
DASH="$ROOT/dev/observability/grafana/dashboards/trove-overview.json"
fails=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; fails=$((fails+1)); }

# Number of series a PromQL query returns (empty string when Prometheus is unreachable or errors).
series_count() {
  curl -sf --max-time 10 --get "$PROM/api/v1/query" --data-urlencode "query=$1" |
    python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d["data"]["result"]) if d.get("status")=="success" else "")' 2>/dev/null
}

echo "== sending 40 requests through the gateway ($GATEWAY)"
for i in $(seq 1 40); do
  if ! curl -s -o /dev/null --max-time 5 "$GATEWAY/api/auth/.well-known/jwks.json"; then
    fail "gateway request $i to $GATEWAY did not connect (is dev/up.sh running?)"
    echo "RESULT: FAIL ($fails failed)"; exit 1
  fi
done
pass "40 requests sent"
echo "== waiting 20s for scrape and export"; sleep 20

n=$(series_count 'http_server_requests_seconds_count{application="gateway"}')
if [ -n "$n" ] && [ "$n" -gt 0 ]; then pass "Prometheus has gateway request metrics ($n series)"; else fail "Prometheus ($PROM) has no http_server_requests_seconds_count for gateway"; fi

if curl -sf --max-time 10 "$JAEGER/api/v3/services" | python3 -c 'import json,sys; sys.exit(0 if "gateway" in json.load(sys.stdin).get("services",[]) else 1)' 2>/dev/null; then
  pass "Jaeger lists the gateway service"; else fail "Jaeger ($JAEGER) does not list gateway"; fi

# Dashboard panels. The 429 panel is checked after the rate-limit probe (Task 5), so it is skipped here.
# Only the 5xx and 429 panels fall back to zero (`or vector(0)`); every other panel must return a real series, so a
# missing metric fails here and names the panel. The p95 panel needs http_server_requests_seconds_bucket series
# (percentile histograms); without them it FAILs. The Hikari query excludes the gateway (no pool).
checked=0
while IFS=$'\t' read -r title expr; do
  checked=$((checked+1))
  n=$(series_count "$expr")
  if [ -n "$n" ] && [ "$n" -gt 0 ]; then pass "panel '$title' ($n series)"; else fail "panel '$title' returned no data (empty result): $expr"; fi
done < <(python3 -I -c '
import json,sys
for p in json.load(open(sys.argv[1]))["panels"]:
    if "429" in p["title"]: continue
    for t in p["targets"]: print(p["title"] + "\t" + t["expr"])
' "$DASH")
echo "panels checked: $checked"
[ "$checked" -gt 0 ] || fail "no dashboard panels were read from $DASH"

if [ "$fails" -eq 0 ]; then echo "RESULT: PASS"; else echo "RESULT: FAIL ($fails failed)"; exit 1; fi
