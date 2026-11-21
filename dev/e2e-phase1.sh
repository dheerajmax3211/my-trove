#!/usr/bin/env bash
# End-to-end proof for Phase 1, against the running dev stack (dev/up.sh in dev-identity-provider mode).
# Everything goes through the gateway on :8080 with real tokens; nothing is mocked.
#   dev/e2e-phase1.sh        exits non-zero if any check fails
set -uo pipefail
GW="${GATEWAY_URL:-http://localhost:8080}"
IDP="${IDP_URL:-http://localhost:9100}"
export DOCKER_HOST="${DOCKER_HOST:-unix://$HOME/.colima/default/docker.sock}"
RUN="$(date +%s)"
pass=0; fail=0

ok()   { echo "  PASS  $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL  $1  ($2)"; fail=$((fail+1)); }
check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected $2, got $3"; fi
}
token() { curl -s -X POST "$IDP/token" -d "{\"email\":\"$1\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])'; }
status() { curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $1" "$GW$2"; }
body() { curl -s -H "Authorization: Bearer $1" "$GW$2"; }
json() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null; }

OWNER_T=$(token dev@example.test)
MEMBER_E="member-$RUN@example.test"; MEMBER_T=$(token "$MEMBER_E")
PROMO_E="promoted-$RUN@example.test"; PROMO_T=$(token "$PROMO_E")
SUSP_E="suspended-$RUN@example.test"; SUSP_T=$(token "$SUSP_E")
BURST_E="burst-$RUN@example.test"; BURST_T=$(token "$BURST_E")

echo "== Authentication at the gateway"
check "no token is rejected"                 401 "$(curl -s -o /dev/null -w '%{http_code}' "$GW/api/auth/v1/me")"
check "garbage token is rejected"            401 "$(status 'aaa.bbb.ccc' /api/auth/v1/me)"
check "unsigned (alg none) token is rejected" 401 "$(status 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4IiwiaXNzIjoiaHR0cDovL2xvY2FsaG9zdDo4MDgxIn0.' /api/auth/v1/me)"
check "internal API is not reachable publicly" 404 "$(status "$OWNER_T" /api/platform/internal/v1/plans)"

echo "== A new user is a MEMBER"
check "member can read /me"                  200 "$(status "$MEMBER_T" /api/auth/v1/me)"
ROLES=$(body "$MEMBER_T" /api/auth/v1/me | json "','.join(sorted(d['roles']))")
check "roles are exactly MEMBER"             MEMBER "$ROLES"
check "member can use shared-service"        200 "$(status "$MEMBER_T" /api/shared/v1/households)"
check "member can use a product (waiting-on)" 200 "$(status "$MEMBER_T" /api/waiting-on/v1/items)"
check "member sees own usage"                200 "$(status "$MEMBER_T" /api/platform/v1/usage/me)"

echo "== Authorization: MEMBER is blocked from owner and admin APIs"
check "member cannot read all-user usage"    403 "$(status "$MEMBER_T" /api/platform/v1/usage/summary)"
check "member cannot list users"             403 "$(status "$MEMBER_T" /api/auth/v1/admin/users)"
check "member cannot read audit log"         403 "$(status "$MEMBER_T" /api/auth/v1/admin/audit)"

echo "== OWNER can see everything"
check "owner reads all-user usage"           200 "$(status "$OWNER_T" /api/platform/v1/usage/summary)"
check "owner lists users"                    200 "$(status "$OWNER_T" /api/auth/v1/admin/users)"
check "owner reads audit log"                200 "$(status "$OWNER_T" /api/auth/v1/admin/audit)"
check "owner reads top users"                200 "$(status "$OWNER_T" '/api/platform/v1/usage/top-users?limit=5')"

echo "== Role changes: grant ADMIN, then the new token works"
PROMO_ID=$(body "$PROMO_T" /api/auth/v1/me | json "d['id']")
check "promoted user starts blocked"         403 "$(status "$PROMO_T" /api/platform/v1/usage/summary)"
check "owner grants ADMIN"                   200 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H "Authorization: Bearer $OWNER_T" "$GW/api/auth/v1/admin/users/$PROMO_ID/roles/ADMIN")"
PROMO_T2=$(token "$PROMO_E")   # a fresh credential bypasses the 60 s exchange cache
check "fresh token carries the new role"     200 "$(status "$PROMO_T2" /api/platform/v1/usage/summary)"
check "ADMIN cannot grant OWNER"             403 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H "Authorization: Bearer $PROMO_T2" "$GW/api/auth/v1/admin/users/$PROMO_ID/roles/OWNER")"
check "ADMIN cannot change plans"            403 "$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H "Authorization: Bearer $PROMO_T2" "$GW/api/auth/v1/admin/users/$PROMO_ID/plan/PRO")"
check "owner revokes ADMIN"                  200 "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -H "Authorization: Bearer $OWNER_T" "$GW/api/auth/v1/admin/users/$PROMO_ID/roles/ADMIN")"

echo "== Suspension"
SUSP_ID=$(body "$SUSP_T" /api/auth/v1/me | json "d['id']")
check "owner suspends a user"                200 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $OWNER_T" "$GW/api/auth/v1/admin/users/$SUSP_ID/suspend")"
SUSP_T2=$(token "$SUSP_E")
check "suspended user is refused at the gateway" 403 "$(status "$SUSP_T2" /api/shared/v1/households)"
check "owner restores the user"              200 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $OWNER_T" "$GW/api/auth/v1/admin/users/$SUSP_ID/restore")"
SUSP_T3=$(token "$SUSP_E")
check "restored user can work again"         200 "$(status "$SUSP_T3" /api/shared/v1/households)"

echo "== Rate limiting (FREE plan: 120 requests/minute)"
GOT429=0; HDR=""
for i in $(seq 1 135); do
  code=$(curl -s -o /dev/null -D /tmp/e2e-hdr.$$ -w '%{http_code}' -H "Authorization: Bearer $BURST_T" "$GW/api/auth/v1/me")
  if [ "$code" = 429 ]; then GOT429=$((GOT429+1)); HDR=$(tr -d '\r' < /tmp/e2e-hdr.$$); fi
done
rm -f /tmp/e2e-hdr.$$
if [ "$GOT429" -ge 1 ]; then ok "burst of 135 produced $GOT429 x 429"; else bad "burst produced no 429" "0 of 135"; fi
echo "$HDR" | grep -qi '^retry-after:' && ok "429 carries Retry-After" || bad "429 carries Retry-After" "header missing"
check "other users are unaffected"           200 "$(status "$MEMBER_T" /api/auth/v1/me)"

echo "== Metering reached Kafka and Timescale"
sleep 8
ROWS=$(docker exec dev-postgres-1 psql -U platform -d platform -At -c "select count(*) from platform.usage_events where ts > now() - interval '10 minutes'" 2>/dev/null)
if [ "${ROWS:-0}" -ge 150 ] 2>/dev/null; then ok "usage_events has $ROWS recent rows"; else bad "usage_events rows" "got ${ROWS:-none}"; fi
TOTAL=$(body "$OWNER_T" '/api/platform/v1/usage/summary' | json "d['totalRequests']")
if [ "${TOTAL:-0}" -ge 100 ] 2>/dev/null; then ok "owner summary reports $TOTAL requests"; else bad "owner summary totalRequests" "got ${TOTAL:-none}"; fi
SELF=$(body "$MEMBER_T" '/api/platform/v1/usage/me' | json "d['totalRequests']")
if [ "${SELF:-0}" -ge 3 ] 2>/dev/null; then ok "member sees own $SELF requests only"; else bad "member own usage" "got ${SELF:-none}"; fi
LEAK=$(docker exec dev-postgres-1 psql -U platform -d platform -At -c "select count(*) from platform.usage_events where route_template ~ '[0-9a-f]{8}-[0-9a-f]{4}'" 2>/dev/null)
check "no raw ids in routeTemplate"          0 "${LEAK:-x}"

echo
echo "passed: $pass   failed: $fail"
[ "$fail" -eq 0 ]
