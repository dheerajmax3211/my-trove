#!/usr/bin/env bash
# End-to-end check of the MCP server through the gateway, against the running dev stack (dev/up.sh in
# dev-identity-provider mode, with mcp-server built and started). Real tokens, real services; nothing is mocked.
#   dev/e2e-mcp.sh        exits non-zero if any check fails
# The owner (dev@example.test) holds mcp:use and products:use; a fresh member holds products:use but not mcp:use.
set -uo pipefail
GW="${GATEWAY_URL:-http://localhost:8080}"
IDP="${IDP_URL:-http://localhost:9100}"
MCP="$GW/api/mcp/mcp"
RUN="$(date +%s)"
pass=0; fail=0

ok()    { echo "  PASS  $1"; pass=$((pass+1)); }
bad()   { echo "  FAIL  $1  ($2)"; fail=$((fail+1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected $2, got $3"; fi; }
token() { curl -s -X POST "$IDP/token" -d "{\"email\":\"$1\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])'; }
rpc()   { # rpc <token> <json body>: prints the response body
  curl -s -X POST "$MCP" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' -d "$2"; }
code()  { curl -s -o /dev/null -w '%{http_code}' -X POST "$MCP" -H "Authorization: Bearer $1" \
    -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d "$2"; }
json()  { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null; }
call()  { rpc "$1" "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"$2\",\"arguments\":$3}}"; }

OWNER_T=$(token dev@example.test)
MEMBER_T=$(token "mcp-member-$RUN@example.test")
PING='{"jsonrpc":"2.0","id":1,"method":"ping"}'

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
for t in 'waiting_on_list_followups {"limit":5}' 'ask_your_life_search {"query":"warranty"}' \
         'home_pulse_appliance_status {}' 'family_treasury_ledger_summary {}'; do
  name="${t%% *}"; args="${t#* }"
  check "$name answers without error"            False "$(call "$OWNER_T" "$name" "$args" | json "d['result'].get('isError', False)")"
done

echo "== Refusals"
check "bad input is a tool error"                True "$(call "$OWNER_T" ask_your_life_search '{"k":3}' | json "d['result']['isError']")"
check "unknown tool is a JSON-RPC error"         True "$(call "$OWNER_T" drop_tables '{}' | json "'error' in d")"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
