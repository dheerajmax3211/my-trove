#!/usr/bin/env bash
# End-to-end proof for the developer platform (W4, backend), against a running dev stack. Everything goes through the
# gateway with real tokens and real API keys; the webhook receiver is a local process and its signature check is
# independent of the platform (plain HMAC-SHA256 in Python).
#   dev/e2e-developer.sh        exits non-zero if any check fails
# Prerequisites: the stack is up (dev/up.sh), personas exist (dev/seed-personas.sh: developer@example.test must hold
# DEVELOPER), and the Kafka and Postgres containers are running.
#
# One step is simulated: reminder-producing services do not publish to platform.domain.events.v1 yet, so the script
# publishes a reminder.created event to that topic itself, in the shape a producer would use.
#
# Revocation: the gateway reuses an exchanged credential for up to 60 s (gateway.exchange.cache-ttl), so the revoked
# key is checked after that window.
set -uo pipefail
GW="${GATEWAY_URL:-http://localhost:8080}"
IDP="${IDP_URL:-http://localhost:9100}"
KAFKA_CONTAINER="${KAFKA_CONTAINER:-dev-kafka-1}"
PG_CONTAINER="${PG_CONTAINER:-dev-postgres-1}"
PG_DB="${E2E_DB:-platform}"
export DOCKER_HOST="${DOCKER_HOST:-unix://$HOME/.colima/default/docker.sock}"
RUN="$(date +%s)"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$HERE/.state/e2e-developer"   # gitignored
mkdir -p "$WORK"
LAST="$WORK/last.json"
RECEIVED="$WORK/deliveries-$RUN.jsonl"
pass=0; fail=0
RECEIVER_PID=""

ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1  ($2)"; fail=$((fail+1)); }
check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected $2, got $3"; fi
}
token() { curl -s -X POST "$IDP/token" -d "{\"email\":\"$1\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])'; }
field() { python3 -c "import json,sys;d=json.load(open('$LAST'));print($1)" 2>/dev/null; }
call() { # call <METHOD> <token or empty> <path> [json]: prints the HTTP status, leaves the body in $LAST
  local m="$1" t="$2" p="$3" d="${4:-}"
  local args=(-s -o "$LAST" -w '%{http_code}' -X "$m")
  [ -n "$t" ] && args+=(-H "Authorization: Bearer $t")
  [ -n "$d" ] && args+=(-H 'Content-Type: application/json' -d "$d")
  curl "${args[@]}" "$GW$p"
}
psql_one() { docker exec "$PG_CONTAINER" psql -U platform -d "$PG_DB" -At -c "$1" 2>/dev/null; }
cleanup() { [ -n "$RECEIVER_PID" ] && kill "$RECEIVER_PID" 2>/dev/null; true; }
trap cleanup EXIT

cat > "$WORK/receiver.py" <<'PY'
import http.server, json, sys
port, out = int(sys.argv[1]), sys.argv[2]
class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        size = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(size).decode('utf-8')
        with open(out, 'a') as f:
            f.write(json.dumps({'path': self.path,
                                'headers': {k.lower(): v for k, v in self.headers.items()},
                                'body': body}) + '\n')
        self.send_response(200)
        self.end_headers()
    def log_message(self, *args):
        pass
http.server.HTTPServer(('127.0.0.1', port), Handler).serve_forever()
PY

DEV_T=$(token developer@example.test)
MEM_E="member-$RUN@example.test"; MEM_T=$(token "$MEM_E")

echo "== Developer persona"
check "developer can read /me"                  200 "$(call GET "$DEV_T" /api/auth/v1/me)"
DEV_ID=$(field "d['id']")
case "$(field "','.join(sorted(d['roles']))")" in
  *DEVELOPER*) ok "developer holds the DEVELOPER role" ;;
  *) bad "developer holds the DEVELOPER role" "roles: $(field "','.join(sorted(d['roles']))") (run dev/seed-personas.sh)" ;;
esac
check "a new member is provisioned"             200 "$(call GET "$MEM_T" /api/auth/v1/me)"

echo "== Developer apps (apps:manage)"
APP_BODY='{"name":"E2E app '"$RUN"'","description":"end to end","redirectUris":["https://app.example.test/cb"]}'
check "developer registers an app" 201 "$(call POST "$DEV_T" /api/platform/v1/developer/apps "$APP_BODY")"
APP=$(field "d['id']")
check "the client secret is returned on create" True "$(field "d['clientSecret'].startswith('cs_')")"
check "a member cannot register an app"         403 "$(call POST "$MEM_T" /api/platform/v1/developer/apps '{"name":"Nope","redirectUris":[]}')"
check "the app list omits the client secret"    True "$(call GET "$DEV_T" /api/platform/v1/developer/apps >/dev/null; field "all('clientSecret' not in a for a in d)")"

echo "== API keys (keys:manage)"
check "developer issues a key with usage:read"  201 "$(call POST "$DEV_T" /api/platform/v1/developer/apps/$APP/keys \
  '{"name":"e2e key","scopes":["usage:read"]}')"
KEY=$(field "d['key']")
KEY_ID=$(field "d['id']")
check "the key carries the pk_ prefix"         True "$(field "d['key'].startswith('pk_')")"
check "the key is stored hashed, not in clear" 1 "$(psql_one "select count(*) from platform.api_keys where id = '$KEY_ID' and key_hash <> '$KEY'")"
check "the key list omits the key value"        True "$(call GET "$DEV_T" /api/platform/v1/developer/apps/$APP/keys >/dev/null; field "all('key' not in k for k in d)")"

echo "== The key, through the gateway"
check "key reaches its allowed route (usage:read)" 200 "$(call GET "$KEY" /api/platform/v1/usage/me)"
check "key is refused outside its scope: usage summary" 403 "$(call GET "$KEY" /api/platform/v1/usage/summary)"
check "key is refused outside its scope: flags"        403 "$(call GET "$KEY" /api/platform/v1/flags)"
check "key cannot manage apps"                          403 "$(call GET "$KEY" /api/platform/v1/developer/apps)"
check "an unknown key is refused"                       401 "$(call GET "pk_00000000_$(printf 'x%.0s' {1..43})" /api/platform/v1/usage/me)"
check "the API is metered with principal API_KEY"       1 "$(sleep 6; psql_one "select count(*) > 0 from platform.usage_events where principal_type = 'API_KEY' and ts > now() - interval '10 minutes'" | sed 's/t/1/;s/f/0/')"

echo "== Webhooks (webhooks:manage), receiver on loopback"
RECV_PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')
python3 -I "$WORK/receiver.py" "$RECV_PORT" "$RECEIVED" >/dev/null 2>&1 &
RECEIVER_PID=$!
HOOK_BODY='{"url":"http://127.0.0.1:'"$RECV_PORT"'/hook","description":"e2e","eventTypes":["reminder.created"]}'
check "developer creates a webhook to the receiver" 201 "$(call POST "$DEV_T" /api/platform/v1/developer/apps/$APP/webhooks "$HOOK_BODY")"
HOOK=$(field "d['id']")
SECRET=$(field "d['secret']")
check "the signing secret is returned on create" True "$(field "d['secret'].startswith('whsec_')")"

echo "== A reminder is created; the signed delivery arrives"
EVENT_ID=$(python3 -c 'import uuid;print(uuid.uuid4())')
OCCURRED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '%s\n' "{\"eventId\":\"$EVENT_ID\",\"type\":\"reminder.created\",\"occurredAt\":\"$OCCURRED\",\"ownerUid\":\"$DEV_ID\",\"data\":{\"title\":\"Renew passport\",\"reminderId\":\"e2e-$RUN\"}}" \
  | docker exec -i "$KAFKA_CONTAINER" /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic platform.domain.events.v1 >/dev/null 2>&1
for _ in $(seq 1 60); do [ -s "$RECEIVED" ] && break; sleep 1; done
check "the receiver got exactly one delivery"   1 "$(wc -l < "$RECEIVED" 2>/dev/null | tr -d ' ')"

VERIFY=$(python3 -I - "$RECEIVED" "$SECRET" "$EVENT_ID" "$(date +%s)" <<'PY'
import hashlib, hmac, json, sys
path, secret, event_id, now = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
try:
    hit = json.loads(open(path).readline())
except Exception as e:
    print("no delivery: %s" % e); sys.exit(0)
h = hit["headers"]
if h.get("x-trove-event-id") != event_id:
    print("event id header mismatch"); sys.exit(0)
if h.get("x-trove-event-type") != "reminder.created":
    print("event type header mismatch"); sys.exit(0)
parts = dict(p.split("=", 1) for p in h.get("x-trove-signature", "").split(","))
ts, sig = parts.get("t", ""), parts.get("v1", "")
if abs(now - int(ts or 0)) > 300:
    print("timestamp outside the tolerance"); sys.exit(0)
expected = hmac.new(secret.encode(), (ts + "." + hit["body"]).encode(), hashlib.sha256).hexdigest()
if not hmac.compare_digest(expected, sig):
    print("signature does not verify"); sys.exit(0)
if json.loads(hit["body"]).get("eventId") != event_id:
    print("body does not carry the event"); sys.exit(0)
print("valid")
PY
)
check "the delivery's signature verifies with the endpoint secret" valid "$VERIFY"
check "the delivery log shows it DELIVERED" DELIVERED "$(for _ in $(seq 1 20); do s=$(call GET "$DEV_T" /api/platform/v1/developer/webhooks/$HOOK/deliveries >/dev/null; field "d[0]['status']"); [ "$s" = DELIVERED ] && break; sleep 1; done; echo "$s")"

DELIVERY=$(field "d[0]['id']")
check "a delivery can be replayed"              202 "$(call POST "$DEV_T" /api/platform/v1/developer/webhooks/$HOOK/deliveries/$DELIVERY/replay)"
for _ in $(seq 1 30); do [ "$(wc -l < "$RECEIVED" | tr -d ' ')" -ge 2 ] && break; sleep 1; done
check "the replay reaches the receiver again"   2 "$(wc -l < "$RECEIVED" | tr -d ' ')"

echo "== Public API document"
check "the gateway lists the platform document"  True "$(call GET "" /api/platform/v1/docs >/dev/null; field "[s for s in d['services'] if s['name']=='platform'][0]['available']")"
check "the platform document is public"          200 "$(curl -s -o /dev/null -w '%{http_code}' "$GW/api/platform/v3/api-docs")"

echo "== Revocation"
check "developer revokes the key"               204 "$(call DELETE "$DEV_T" /api/platform/v1/developer/keys/$KEY_ID)"
echo "  waiting 61 s for the gateway's exchange cache to expire"
sleep 61
check "the revoked key is refused"              401 "$(call GET "$KEY" /api/platform/v1/usage/me)"

echo
echo "passed: $pass   failed: $fail"
[ "$fail" -eq 0 ]
