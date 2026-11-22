#!/usr/bin/env bash
# Create one real account per persona on the running dev stack (dev/up.sh must be up) and grant its roles
# through the real admin API. Everything goes through the gateway and the real token exchange.
#   dev/seed-personas.sh
# Sign in as any of these with the dev identity provider: "Email me a sign-in link" with the address
# (no password). The owner is dev@example.test. MEMBER is the baseline role every new account gets.
set -euo pipefail
GW="${GATEWAY_URL:-http://localhost:8080}"
IDP="${IDP_URL:-http://localhost:9100}"

token() { curl -s -X POST "$IDP/token" -d "{\"email\":\"$1\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])'; }
uid_of() { curl -s -H "Authorization: Bearer $1" "$GW/api/auth/v1/me" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])'; }
grant() { curl -s -o /dev/null -w "%{http_code}" -X PUT -H "Authorization: Bearer $OWNER" "$GW/api/auth/v1/admin/users/$1/roles/$2"; }

OWNER=$(token dev@example.test)
role_for() {
  case "$1" in
    member@example.test) echo MEMBER ;;
    developer@example.test) echo DEVELOPER ;;
    admin@example.test) echo ADMIN ;;
    auditor@example.test) echo AUDITOR ;;
  esac
}
for email in member@example.test developer@example.test admin@example.test auditor@example.test; do
  t=$(token "$email")
  id=$(uid_of "$t")                      # first call provisions the account as MEMBER
  role=$(role_for "$email")
  if [ "$role" != MEMBER ]; then
    echo "$email -> $role (grant HTTP $(grant "$id" "$role"))"
  else
    echo "$email -> MEMBER"
  fi
done
echo "owner: dev@example.test (ADMIN and OWNER from bootstrap)"
