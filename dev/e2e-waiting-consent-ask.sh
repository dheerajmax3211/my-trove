#!/usr/bin/env bash
# End-to-end proof for the Waiting On, Consent and Ask Your Life flows, against the running dev stack
# (dev/up.sh in dev-identity-provider mode). Everything goes through the gateway on :8080 with real tokens.
# The browser side of the same flows is dev/e2e-waiting-consent-ask-ui.mjs.
#   dev/e2e-waiting-consent-ask.sh        exits non-zero if any check fails
set -uo pipefail
GW="${GATEWAY_URL:-http://localhost:8080}"
IDP="${IDP_URL:-http://localhost:9100}"
MEMBER_EMAIL="${MEMBER_EMAIL:-member@example.test}"
RUN="$(date +%s)"
pass=0; fail=0

ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1  ($2)"; fail=$((fail+1)); }
check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected $2, got $3"; fi
}
token() { curl -s -X POST "$IDP/token" -d "{\"email\":\"$1\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])'; }
# request <method> <token> <path> [json-body]  -> prints "<status> <body>"
request() {
  local method="$1" tok="$2" path="$3" data="${4:-}"
  local args=(-s -X "$method" -H "Authorization: Bearer $tok" -w '\n%{http_code}')
  [ -n "$data" ] && args+=(-H 'Content-Type: application/json' -d "$data")
  local out; out=$(curl "${args[@]}" "$GW$path")
  echo "$(echo "$out" | tail -n1) $(echo "$out" | sed '$d')"
}
code() { echo "$1" | cut -d' ' -f1; }
body() { echo "$1" | cut -d' ' -f2-; }

MEMBER_T=$(token "$MEMBER_EMAIL")
echo "== Waiting On: add an item, see its follow-up, resolve it (member: $MEMBER_EMAIL)"
EXPECTED=$(python3 -c 'import datetime;print((datetime.date.today()-datetime.timedelta(days=14)).isoformat())')
R=$(request POST "$MEMBER_T" /api/waiting-on/v1/items "{\"title\":\"e2e refund $RUN\",\"counterparty\":\"ACME Support\",\"category\":\"REFUND\",\"currency\":\"USD\",\"amount\":49.90,\"expectedBy\":\"$EXPECTED\"}")
check "add a refund item"                    201 "$(code "$R")"
ITEM=$(python3 -c "import sys,json;print(json.loads(sys.stdin.read().split(' ',1)[1])['id'])" <<<"$R")
D=$(request GET "$MEMBER_T" "/api/waiting-on/v1/items/$ITEM")
check "detail is readable"                   200 "$(code "$D")"
check "a live follow-up is scheduled"        Nudge "$(python3 -c "import sys,json;print(json.loads(sys.stdin.read().split(' ',1)[1])['followUp']['nextAction'].title())" <<<"$D" 2>/dev/null)"
L=$(request GET "$MEMBER_T" "/api/waiting-on/v1/items/$ITEM/draft?tone=NUDGE")
check "nudge letter is drafted"              200 "$(code "$L")"
if body "$L" | grep -q "@reply.waiting-on.local"; then bad "letter does not ask for replies at the unread address" "reply address still in the letter"; else ok "letter does not ask for replies at the unread address"; fi
RS=$(request POST "$MEMBER_T" "/api/waiting-on/v1/items/$ITEM/resolve" '{"outcome":"e2e: refunded"}')
check "resolve closes the item"              RESOLVED "$(python3 -c "import sys,json;print(json.loads(sys.stdin.read().split(' ',1)[1])['status'])" <<<"$RS" 2>/dev/null)"

echo "== Consent: a third-party app asks, the owner narrows and approves, the app reads only that, then revoke"
R=$(request PUT "$MEMBER_T" /api/consent/v1/owner/vault/attributes/profile.sizes.shoe '{"value":"US 10","sensitivity":"PERSONAL"}')
check "owner stores an attribute"            200 "$(code "$R")"
R=$(request POST "$MEMBER_T" /api/consent/v1/owner/clients "{\"name\":\"e2e sample app $RUN\",\"allowedScopes\":[\"profile.sizes:read\",\"profile.contact:read\"]}")
check "owner registers an app"               201 "$(code "$R")"
CID=$(python3 -c "import sys,json;print(json.loads(sys.stdin.read().split(' ',1)[1])['client']['clientId'])" <<<"$R")
CSECRET=$(python3 -c "import sys,json;print(json.loads(sys.stdin.read().split(' ',1)[1])['clientSecret'])" <<<"$R")
TOKFILE=$(mktemp)
TOK=$(curl -s -o "$TOKFILE" -w '%{http_code}' -X POST "$GW/api/consent/v1/oauth/token" \
  -d "grant_type=client_credentials&client_id=$CID&client_secret=$CSECRET")
check "the app authenticates with its secret" 200 "$TOK"
APP_T=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['access_token'])" "$TOKFILE" 2>/dev/null); rm -f "$TOKFILE"
R=$(request POST "$APP_T" /api/consent/v1/gateway/requests "{\"scopes\":[\"profile.sizes:read\",\"profile.contact:read\"],\"purpose\":\"e2e shoe size check\",\"durationSeconds\":3600,\"maxReads\":5}")
check "the app requests access"              201 "$(code "$R")"
REQ=$(python3 -c "import sys,json;print(json.loads(sys.stdin.read().split(' ',1)[1])['id'])" <<<"$R")
R=$(request GET "$APP_T" "/api/consent/v1/gateway/requests/$REQ")
check "the request is pending until decided" PENDING "$(python3 -c "import sys,json;print(json.loads(sys.stdin.read().split(' ',1)[1])['status'])" <<<"$R" 2>/dev/null)"
R=$(request GET "$MEMBER_T" /api/consent/v1/owner/requests)
check "the owner sees the request"           1 "$(python3 -c "import sys,json;print(sum(1 for r in json.loads(sys.stdin.read().split(' ',1)[1]) if r['id']=='$REQ'))" <<<"$R" 2>/dev/null)"
R=$(request POST "$MEMBER_T" "/api/consent/v1/owner/requests/$REQ/approve" '{"scopes":["profile.sizes:read"]}')
check "the owner approves, narrowed"         200 "$(code "$R")"
GRANT=$(python3 -c "import sys,json;print(json.loads(sys.stdin.read().split(' ',1)[1])['id'])" <<<"$R")
R=$(request GET "$APP_T" "/api/consent/v1/gateway/requests/$REQ")
check "the app sees the grant"               "$GRANT" "$(python3 -c "import sys,json;print(json.loads(sys.stdin.read().split(' ',1)[1])['grantId'])" <<<"$R" 2>/dev/null)"
R=$(request POST "$APP_T" "/api/consent/v1/gateway/grants/$GRANT/token")
check "the grant exchanges for an access token" 200 "$(code "$R")"
ACC=$(python3 -c "import sys,json;print(json.loads(sys.stdin.read().split(' ',1)[1])['access_token'])" <<<"$R")
R=$(request GET "$ACC" /api/consent/v1/gateway/data)
check "the app reads its approved data"      200 "$(code "$R")"
check "and gets only the approved attribute" profile.sizes.shoe "$(python3 -c "import sys,json;print(','.join(a['key'] for a in json.loads(sys.stdin.read().split(' ',1)[1])['attributes']))" <<<"$R" 2>/dev/null)"
R=$(request GET "$ACC" "/api/consent/v1/gateway/data?path=profile.contact")
check "a slice the owner narrowed away is refused" 403 "$(code "$R")"
R=$(request GET "$ACC" "/api/consent/v1/gateway/data?path=health")
check "a slice never requested is refused"   403 "$(code "$R")"
R=$(request POST "$MEMBER_T" "/api/consent/v1/owner/grants/$GRANT/revoke")
check "the owner revokes the grant"          200 "$(code "$R")"
R=$(request GET "$ACC" /api/consent/v1/gateway/data)
check "the same token is refused after revoke" 403 "$(code "$R")"
R=$(request GET "$MEMBER_T" /api/consent/v1/owner/access-log)
if body "$R" | grep -q "GRANT_REVOKED"; then ok "the audit log records the revoke"; else bad "the audit log records the revoke" "no GRANT_REVOKED entry"; fi
R=$(request GET "$MEMBER_T" /api/consent/v1/owner/audit/verify)
check "the audit chain verifies"             true "$(python3 -c "import sys,json;print(str(json.loads(sys.stdin.read().split(' ',1)[1])['valid']).lower())" <<<"$R" 2>/dev/null)"

echo "== Ask Your Life: add a note, let it index, find it by what you remember"
NOTE="Nonna's lasagne (e2e $RUN): three layers, a bechamel white sauce, bake at 180C for 45 minutes."
R=$(curl -s -w '\n%{http_code}' -X POST "$GW/api/ask-your-life/v1/documents?title=Lasagne%20e2e%20$RUN&sourceType=NOTE" \
  -H "Authorization: Bearer $MEMBER_T" -H 'Content-Type: text/plain' --data-binary "$NOTE")
check "the note is accepted for indexing"    202 "$(echo "$R" | tail -n1)"
DOC=$(echo "$R" | sed '$d' | python3 -c 'import sys,json;print(json.load(sys.stdin)["document"]["id"])' 2>/dev/null)
STATUS=""
for _ in $(seq 1 30); do
  STATUS=$(request GET "$MEMBER_T" "/api/ask-your-life/v1/documents/$DOC" | python3 -c 'import sys,json;print(json.loads(sys.stdin.read().split(" ",1)[1])["status"])' 2>/dev/null)
  [ "$STATUS" = INDEXED ] && break
  sleep 1
done
check "the note is indexed"                  INDEXED "$STATUS"
R=$(request GET "$MEMBER_T" "/api/ask-your-life/v1/search?q=that%20pasta%20recipe%20with%20the%20white%20sauce&mode=hybrid")
if body "$R" | grep -q "Lasagne e2e $RUN"; then ok "a question in your own words finds it"; else bad "a question in your own words finds it" "$(code "$R")"; fi

echo
echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
