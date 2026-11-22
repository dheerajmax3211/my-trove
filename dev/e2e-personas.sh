#!/usr/bin/env bash
# Persona matrix against the running dev stack (dev/up.sh in dev-identity-provider mode, personas seeded by
# dev/seed-personas.sh). Every call goes through the real gateway with a real token from the dev identity provider, so
# the platform token exchange, the permission checks and the role guardrails are all exercised. Design 5.2 is the
# expectation. Writes only to a throwaway account created by this run, and puts back every role and plan it changes.
#   dev/e2e-personas.sh        exits non-zero if any check fails
set -uo pipefail
GW="${GATEWAY_URL:-http://localhost:8080}"
IDP="${IDP_URL:-http://localhost:9100}"
RUN="$(date +%s)"
pass=0; fail=0

ok()    { echo "  PASS  $1"; pass=$((pass+1)); }
bad()   { echo "  FAIL  $1  ($2)"; fail=$((fail+1)); }
check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected $2, got $3"; fi
}
token() { curl -s -X POST "$IDP/token" -d "{\"email\":\"$1\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])'; }
me()    { curl -s -H "Authorization: Bearer $1" "$GW/api/auth/v1/me"; }
field() { python3 -c 'import sys,json; print(json.loads(sys.argv[1])[sys.argv[2]])' "$1" "$2"; }
holds() { python3 -c 'import sys,json; d=json.loads(sys.argv[1]); print("yes" if sys.argv[2] in d["permissions"] else "no")' "$1" "$2"; }
# call <METHOD> <token> <path> [json-body]  -> HTTP status
call()  {
  if [ $# -ge 4 ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$1" -H "Authorization: Bearer $2" -H 'content-type: application/json' -d "$4" "$GW$3"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$1" -H "Authorization: Bearer $2" "$GW$3"
  fi
}

echo "== Sign-in: the five personas exist and carry their seeded roles"
OWNER_T=$(token dev@example.test)
ADMIN_T=$(token admin@example.test)
DEV_T=$(token developer@example.test)
MEMBER_T=$(token member@example.test)
AUDITOR_T=$(token auditor@example.test)
OWNER_ME=$(me "$OWNER_T"); ADMIN_ME=$(me "$ADMIN_T"); DEV_ME=$(me "$DEV_T"); MEMBER_ME=$(me "$MEMBER_T"); AUDITOR_ME=$(me "$AUDITOR_T")
OWNER_ID=$(field "$OWNER_ME" id)

has_role() { python3 -c 'import sys,json; print("yes" if sys.argv[2] in json.loads(sys.argv[1])["roles"] else "no")' "$1" "$2"; }
check "owner holds OWNER"        yes "$(has_role "$OWNER_ME" OWNER)"
check "admin holds ADMIN"        yes "$(has_role "$ADMIN_ME" ADMIN)"
check "developer holds DEVELOPER" yes "$(has_role "$DEV_ME" DEVELOPER)"
check "member holds only MEMBER" no "$(has_role "$MEMBER_ME" ADMIN)"
check "auditor holds AUDITOR"    yes "$(has_role "$AUDITOR_ME" AUDITOR)"

echo "== Permissions each role holds (design 5.2)"
check "owner may grant ADMIN/OWNER"         yes "$(holds "$OWNER_ME" roles:assign:privileged)"
check "owner may change plans"              yes "$(holds "$OWNER_ME" plans:manage)"
check "admin may suspend and restore"       yes "$(holds "$ADMIN_ME" users:write)"
check "admin may assign roles"              yes "$(holds "$ADMIN_ME" roles:assign)"
check "admin may not grant ADMIN/OWNER"     no  "$(holds "$ADMIN_ME" roles:assign:privileged)"
check "admin may not change plans"          no  "$(holds "$ADMIN_ME" plans:manage)"
check "admin has no developer tools"        no  "$(holds "$ADMIN_ME" apps:manage)"
check "developer may manage apps and keys"  yes "$(holds "$DEV_ME" apps:manage)"
check "developer may not see people"        no  "$(holds "$DEV_ME" users:read)"
check "developer may not see all usage"     no  "$(holds "$DEV_ME" usage:read:all)"
check "member may use products"             yes "$(holds "$MEMBER_ME" products:use)"
check "member may not see people"           no  "$(holds "$MEMBER_ME" users:read)"
check "member may not assign roles"         no  "$(holds "$MEMBER_ME" roles:assign)"
check "auditor reads usage, people, audit"  yes "$(holds "$AUDITOR_ME" usage:read:all)"
check "auditor may read the audit log"      yes "$(holds "$AUDITOR_ME" audit:read)"
check "auditor may not suspend people"      no  "$(holds "$AUDITOR_ME" users:write)"
check "auditor may not assign roles"        no  "$(holds "$AUDITOR_ME" roles:assign)"

echo "== What each persona's API calls return"
GET_ROW() { # GET_ROW <name> <path> <expected owner> <admin> <developer> <member> <auditor>
  local name="$1" path="$2"
  check "owner:     $name" "$3" "$(call GET "$OWNER_T" "$path")"
  check "admin:     $name" "$4" "$(call GET "$ADMIN_T" "$path")"
  check "developer: $name" "$5" "$(call GET "$DEV_T" "$path")"
  check "member:    $name" "$6" "$(call GET "$MEMBER_T" "$path")"
  check "auditor:   $name" "$7" "$(call GET "$AUDITOR_T" "$path")"
}
GET_ROW "people (users:read)"        /api/auth/v1/admin/users            200 200 403 403 200
GET_ROW "roles (users:read)"         /api/auth/v1/admin/roles            200 200 403 403 200
GET_ROW "audit log (audit:read)"     /api/auth/v1/admin/audit            200 200 403 403 200
GET_ROW "usage across platform"      /api/platform/v1/usage/summary      200 200 403 403 200
GET_ROW "own usage (self or all)"    /api/platform/v1/usage/me           200 200 200 200 200
GET_ROW "own profile"                /api/auth/v1/me                     200 200 200 200 200

echo "== Unauthenticated and bad tokens"
check "no token is 401"              401 "$(curl -s -o /dev/null -w '%{http_code}' "$GW/api/auth/v1/me")"
check "garbage token is 401"         401 "$(call GET aaa.bbb.ccc /api/auth/v1/me)"

echo "== Role guardrails (writes go to a throwaway account, then roles are put back)"
TARGET_E="persona-$RUN@example.test"
TARGET_T=$(token "$TARGET_E")
TARGET_ID=$(field "$(me "$TARGET_T")" id)           # first call provisions the account as MEMBER
ROLES="/api/auth/v1/admin/users/$TARGET_ID/roles"
check "member cannot assign roles (403)"              403 "$(call PUT "$MEMBER_T" "$ROLES/DEVELOPER")"
check "auditor cannot assign roles (403)"             403 "$(call PUT "$AUDITOR_T" "$ROLES/DEVELOPER")"
check "admin grants DEVELOPER (200)"                  200 "$(call PUT "$ADMIN_T" "$ROLES/DEVELOPER")"
check "admin revokes DEVELOPER (200)"                 200 "$(call DELETE "$ADMIN_T" "$ROLES/DEVELOPER")"
check "admin cannot grant ADMIN (403)"                403 "$(call PUT "$ADMIN_T" "$ROLES/ADMIN")"
check "admin cannot grant OWNER (403)"                403 "$(call PUT "$ADMIN_T" "$ROLES/OWNER")"
check "owner grants ADMIN (200)"                      200 "$(call PUT "$OWNER_T" "$ROLES/ADMIN")"
check "owner revokes ADMIN (200)"                     200 "$(call DELETE "$OWNER_T" "$ROLES/ADMIN")"
check "admin cannot suspend an owner (403)"           403 "$(call POST "$ADMIN_T" "/api/auth/v1/admin/users/$OWNER_ID/suspend")"
check "admin cannot remove an owner's role (403)"     403 "$(call DELETE "$ADMIN_T" "/api/auth/v1/admin/users/$OWNER_ID/roles/OWNER")"
check "admin cannot change a plan (403)"              403 "$(call PUT "$ADMIN_T" "/api/auth/v1/admin/users/$TARGET_ID/plan/PRO")"
check "owner changes a plan (200)"                    200 "$(call PUT "$OWNER_T" "/api/auth/v1/admin/users/$TARGET_ID/plan/PRO")"
check "owner puts the plan back (200)"                200 "$(call PUT "$OWNER_T" "/api/auth/v1/admin/users/$TARGET_ID/plan/FREE")"
check "admin suspends the throwaway (200)"            200 "$(call POST "$ADMIN_T" "/api/auth/v1/admin/users/$TARGET_ID/suspend")"
check "admin restores the throwaway (200)"            200 "$(call POST "$ADMIN_T" "/api/auth/v1/admin/users/$TARGET_ID/restore")"

echo "== Email sign-in link (one time, bound to its address)"
LINK_E="link-$RUN@example.test"
ISSUED=$(curl -s -X POST "$IDP/link" -d "{\"email\":\"$LINK_E\"}")
CODE=$(python3 -c 'import sys,json; print(json.loads(sys.argv[1])["code"])' "$ISSUED")
check "a link is issued and no token is minted by issuing it" "1" "$(python3 -c 'import sys,json; print(1 if "code" in json.loads(sys.argv[1]) and "token" not in json.loads(sys.argv[1]) else 0)' "$ISSUED")"
WRONG_BODY="{\"code\":\"$CODE\",\"email\":\"other-$RUN@example.test\"}"
RIGHT_BODY="{\"code\":\"$CODE\",\"email\":\"$LINK_E\"}"
consume() { curl -s -o /dev/null -w '%{http_code}' -X POST "$IDP/link/consume" -H 'content-type: application/json' -d "$1"; }
check "opening it with another address is refused (403)" 403 "$(consume "$WRONG_BODY")"
check "opening it with its own address signs in (200)"   200 "$(consume "$RIGHT_BODY")"
check "the same link cannot be used twice (410)"         410 "$(consume "$RIGHT_BODY")"

echo ""
echo "persona matrix: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
