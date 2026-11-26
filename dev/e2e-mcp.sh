#!/usr/bin/env bash
# End-to-end check of the MCP server against the running dev stack (dev/up.sh in dev-identity-provider mode, with
# mcp-server built and started). Real tokens, real services; nothing is mocked.
#   dev/e2e-mcp.sh        exits non-zero if any check fails
# The owner (dev@example.test) holds mcp:use and products:use; a fresh member holds products:use but not mcp:use.
# The API-key part creates an app and keys as developer@example.test (dev/seed-personas.sh must have made it a
# DEVELOPER), the way dev/e2e-developer.sh does, and revokes the keys at the end.
#
# Default: everything goes through the gateway, which exchanges each credential (dev-IdP token or pk_ key) at auth.
# Direct mode, for trying changed services on spare ports beside the shared stack: set AUTH_URL (auth to exchange
# credentials at), MCP_URL (an mcp-server's /mcp) and PLATFORM_URL (a platform-service), and the script exchanges
# each credential itself and calls those services directly.
set -uo pipefail
GW="${GATEWAY_URL:-http://localhost:8080}"
IDP="${IDP_URL:-http://localhost:9100}"
DIRECT_AUTH="${AUTH_URL:-}"
MCP="${MCP_URL:-$GW/api/mcp/mcp}"
PLATFORM="${PLATFORM_URL:-$GW/api/platform}"
PG_CONTAINER="${PG_CONTAINER:-dev-postgres-1}"
PG_DB="${E2E_DB:-platform}"
export DOCKER_HOST="${DOCKER_HOST:-unix://$HOME/.colima/default/docker.sock}"
RUN="$(date +%s)"
pass=0; fail=0

ok()    { echo "  PASS  $1"; pass=$((pass+1)); }
bad()   { echo "  FAIL  $1  ($2)"; fail=$((fail+1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected $2, got $3"; fi; }
idp()   { curl -s -X POST "$IDP/token" -d "{\"email\":\"$1\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])'; }
bearer() { # bearer <credential>: what to send. Through the gateway the credential itself; direct, its exchanged token
  if [ -z "$DIRECT_AUTH" ]; then echo "$1"; return; fi
  curl -s -X POST "$DIRECT_AUTH/v1/token/exchange" -H "Authorization: Bearer $1" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin).get("accessToken","refused"))' 2>/dev/null || echo refused
}
token() { bearer "$(idp "$1")"; }
rpc()   { # rpc <token> <json body>: prints the response body
  curl -s -X POST "$MCP" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' -d "$2"; }
code()  { curl -s -o /dev/null -w '%{http_code}' -X POST "$MCP" -H "Authorization: Bearer $1" \
    -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d "$2"; }
json()  { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null; }
call()  { rpc "$1" "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"$2\",\"arguments\":$3}}"; }
errcode() { json "d['result']['structuredContent']['error']['code'] if d['result'].get('isError') else 'none'"; }
platform() { # platform <METHOD> <token> <path> [json]: prints the body
  curl -s -X "$1" "$PLATFORM$3" -H "Authorization: Bearer $2" ${4:+-H 'Content-Type: application/json' -d "$4"}; }
psql_one() { docker exec "$PG_CONTAINER" psql -U platform -d "$PG_DB" -At -c "$1" 2>/dev/null; }

OWNER_T=$(token dev@example.test)
MEMBER_T=$(token "mcp-member-$RUN@example.test")
PING='{"jsonrpc":"2.0","id":1,"method":"ping"}'
TOOLS=('waiting_on_list_followups {"limit":5}' 'ask_your_life_search {"query":"warranty"}'
       'home_pulse_appliance_status {}' 'family_treasury_ledger_summary {}')
[ -n "$DIRECT_AUTH" ] && echo "(direct mode: auth $DIRECT_AUTH, mcp $MCP, platform $PLATFORM)"

echo "== Endpoint access"
check "no token is rejected"                     401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$MCP" -d "$PING")"
check "member without mcp:use is forbidden"      403 "$(code "$MEMBER_T" "$PING")"
check "owner can ping"                           200 "$(code "$OWNER_T" "$PING")"

echo "== Protocol"
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"e2e","version":"1"}}}'
check "initialize names the server"              my-trove "$(rpc "$OWNER_T" "$INIT" | json "d['result']['serverInfo']['name']")"
check "initialize agrees the protocol version"   2025-06-18 "$(rpc "$OWNER_T" "$INIT" | json "d['result']['protocolVersion']")"
check "tools/list has four tools"                4 "$(rpc "$OWNER_T" '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | json "len(d['result']['tools'])")"

echo "== Each tool, as the owner"
for t in "${TOOLS[@]}"; do
  name="${t%% *}"; args="${t#* }"
  check "$name answers without error"            False "$(call "$OWNER_T" "$name" "$args" | json "d['result'].get('isError', False)")"
done

echo "== Refusals"
check "bad input is a tool error"                True "$(call "$OWNER_T" ask_your_life_search '{"k":3}' | json "d['result']['isError']")"
check "unknown tool is a JSON-RPC error"         True "$(call "$OWNER_T" drop_tables '{}' | json "'error' in d")"

echo "== API keys act for their owner (developer@example.test)"
DEV_T=$(token developer@example.test)
DEV_ID=$(curl -s "$( [ -n "$DIRECT_AUTH" ] && echo "$DIRECT_AUTH" || echo "$GW/api/auth" )/v1/me" -H "Authorization: Bearer $DEV_T" | json "d['id']")
APP=$(platform POST "$DEV_T" /v1/developer/apps "{\"name\":\"MCP e2e $RUN\",\"redirectUris\":[]}" | json "d['id']")
check "developer registers an app"               True "$( [ -n "$APP" ] && echo True || echo False)"
issue() { platform POST "$DEV_T" "/v1/developer/apps/$APP/keys" "{\"name\":\"$1\",\"scopes\":$2}"; }

USAGE_KEY_JSON=$(issue "usage only" '["usage:read"]')
USAGE_KEY=$(echo "$USAGE_KEY_JSON" | json "d['key']")
check "a key with only usage:read cannot reach /mcp" 403 "$(code "$(bearer "$USAGE_KEY")" "$PING")"
platform DELETE "$DEV_T" "/v1/developer/keys/$(echo "$USAGE_KEY_JSON" | json "d['id']")" >/dev/null

MCP_ONLY_JSON=$(issue "mcp only" '["mcp:use"]')
MCP_ONLY=$(bearer "$(echo "$MCP_ONLY_JSON" | json "d['key']")")
check "an mcp:use key can list the tools"        4 "$(rpc "$MCP_ONLY" '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | json "len(d['result']['tools'])")"
check "an mcp:use key without products:read is refused by the tools" forbidden \
  "$(call "$MCP_ONLY" waiting_on_list_followups '{}' | errcode)"
platform DELETE "$DEV_T" "/v1/developer/keys/$(echo "$MCP_ONLY_JSON" | json "d['id']")" >/dev/null

AGENT_JSON=$(issue "agent" '["mcp:use","products:read"]')
AGENT_ID=$(echo "$AGENT_JSON" | json "d['id']")
AGENT=$(bearer "$(echo "$AGENT_JSON" | json "d['key']")")
check "the agent key is issued with mcp:use and products:read" "mcp:use,products:read" \
  "$(echo "$AGENT_JSON" | json "','.join(sorted(d['scopes']))")"
for t in "${TOOLS[@]}"; do
  name="${t%% *}"; args="${t#* }"
  check "key: $name reads the owner's data"      none "$(call "$AGENT" "$name" "$args" | errcode)"
done
check "the audit names the app and the owner for each call" 4 \
  "$(psql_one "select count(*) from mcp.tool_calls where principal_type = 'API_KEY' and principal_id = 'app:$APP' and on_behalf_of = '$DEV_ID' and outcome = 'OK'")"

echo "== Revoking the key stops it at once"
platform DELETE "$DEV_T" "/v1/developer/keys/$AGENT_ID" >/dev/null
check "a tool call right after revocation is refused (even with a still-valid exchanged token)" delegation_refused \
  "$(call "$AGENT" home_pulse_appliance_status '{}' | errcode)"
check "the refusal is audited as DENIED for the app and owner" 1 \
  "$(psql_one "select count(*) from mcp.tool_calls where principal_id = 'app:$APP' and on_behalf_of = '$DEV_ID' and outcome = 'DENIED' and error_code = 'delegation_refused'")"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
