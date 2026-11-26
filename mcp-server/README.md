# mcp-server

Exposes My-Trove to AI agents over the [Model Context Protocol](https://modelcontextprotocol.io): four read-only
tools over the signed-in person's own data, each checked against the caller's permissions and each call audited.
Port **8090** (management/Prometheus on **9090**, private). Schema: `mcp`. Spec item Phase 3.F.

## How it works

```
MCP client ──POST /api/mcp/mcp──► gateway ──(mcp:use? exchange → platform token)──► mcp-server POST /mcp
                                                                                        │ tools/call
                                                                   check products:use, person not API key
                                                                                        │ caller's own token
                                           waiting-on · ask-your-life · home-pulse · family-treasury (direct)
                                                                                        │
                                                                         mcp.tool_calls (append-only audit)
```

- **Protocol.** The official MCP Java SDK (`io.modelcontextprotocol.sdk:mcp` **2.1.0**, pinned; it runs on Boot 4.1.2
  with Jackson 3 and needed no hand-written JSON-RPC). Transport: the SDK's *stateless* Streamable HTTP servlet
  (`HttpServletStatelessServerTransport`) at `/mcp`: JSON-RPC 2.0 over `POST`, one JSON response per request, no
  session, so any replica can answer. `GET /mcp` (a server-sent event stream) answers 405, which the spec allows.
  Methods: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`. Protocol versions the SDK
  negotiates: up to `2025-11-25` (`2025-06-18` tested too).
- **Auth.** The gateway route `mcp` (`/api/mcp/**`, prefix stripped) needs `mcp:use` for people; an API key may call
  `POST /mcp` only, and only if its token carries `mcp:use` (scope `mcp:use` in the platform-service catalogue).
  mcp-server checks `mcp:use` again on `/mcp` (so a request that bypasses the gateway gets the same answer) and
  denies every other path on the main port.
- **Consent scoping.** A tool runs only if the caller's token carries the tool's product permission (`products:use`
  for all four, the same permission the gateway requires for those products' own routes). Otherwise the result is an
  MCP tool error (`isError: true`, `structuredContent.error.code = "forbidden"`, `requiredPermission`), never data,
  and no product service is called.
- **Calls downstream** go straight to each service with the caller's own platform token (the gateway cannot
  exchange a platform token again). No credential of mcp-server's own exists; each service applies its own per-user
  rules (e.g. Family Treasury refuses a household the caller is not a member of, which becomes a
  `downstream_denied` tool error).
- **Audit.** Every `tools/call`, including unknown tools and arguments the SDK's schema validation rejects, writes one
  `mcp.tool_calls` row: principal type and id (`sub`), tool, SHA-256 of the canonical (key-sorted) arguments JSON
  (never the arguments: search queries are personal), result size in bytes, outcome
  (`OK | DENIED | INVALID | UNKNOWN_TOOL | ERROR`), error code, duration, time. The table is append-only (trigger in
  `mcp_ext/V100`). The row is written before the answer leaves; if the write fails, the answer is withheld.

## Tools

| Tool | Arguments | Reads | Returns |
|---|---|---|---|
| `waiting_on_list_followups` | `limit` 1-20 (10) | `GET /v1/items?status=OPEN,NUDGED,ESCALATED`, then each item's detail for the workflow state | items with status and `nextStep {stage, action, at}` (null when the workflow state cannot be read) |
| `ask_your_life_search` | `query` (1-500 chars, required), `k` 1-10 (5) | `GET /v1/search?q=&k=` | passages (plain text, highlight markup removed) with document titles and scores |
| `home_pulse_appliance_status` | `applianceId` (UUID, optional) | `GET /v1/appliances`, then `/v1/appliances/{id}/health` each (max 25) | appliances with health status and open alerts |
| `family_treasury_ledger_summary` | `householdId` (UUID, optional) | `GET /v1/households` (or one), then `/v1/households/{id}/accounts` (max 10) | balance per account, in minor units and as a decimal in the account's currency |

Every tool has a JSON input schema with `additionalProperties: false`, is annotated read-only and non-destructive,
and returns a text summary in `content` plus the same data in `structuredContent`. Input is validated twice: by the
SDK against the schema, and by the tool's own checks (so it stays safe if validation were switched off).

## Connecting an MCP client

The endpoint is `http://localhost:8080/api/mcp/mcp` in the dev stack (`<API_URL>/api/mcp/mcp` elsewhere). Send a
bearer credential the gateway understands.

**Claude Code** (`.mcp.json` in a project, or `claude mcp add`):

```json
{
  "mcpServers": {
    "my-trove": {
      "type": "http",
      "url": "http://localhost:8080/api/mcp/mcp",
      "headers": { "Authorization": "Bearer ${TROVE_TOKEN}" }
    }
  }
}
```

```bash
claude mcp add --transport http my-trove http://localhost:8080/api/mcp/mcp --header "Authorization: Bearer $TROVE_TOKEN"
```

**Claude Desktop** takes local (stdio) servers in `claude_desktop_config.json`; a remote HTTP server can be bridged
with `mcp-remote`:

```json
{
  "mcpServers": {
    "my-trove": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8080/api/mcp/mcp", "--header", "Authorization: Bearer ${TROVE_TOKEN}"],
      "env": { "TROVE_TOKEN": "pk_..." }
    }
  }
}
```

What to put in `TROVE_TOKEN`:

- **An API key** (`pk_...`) with the scope `mcp:use`, created in the workspace's Developer section (or
  `POST /api/platform/v1/developer/apps/{appId}/keys` with `{"name":"agent","scopes":["mcp:use"]}`). The key can
  connect, `initialize` and `tools/list`. **It cannot read product data yet:** a key's token is a service token
  (`sub = app:<appId>`) that by design never acts as its owner, and the products key their data by the person, so
  every tool answers `api_key_not_supported` for keys (and `forbidden` first if the key lacks `products:use`, which
  no scope grants). Letting a key act for its owner needs a deliberate token change in `auth`; it is not done here.
- **A person's sign-in token** (Firebase ID token; in dev, `curl -s -X POST localhost:9100/token -d
  '{"email":"dev@example.test"}'`). This is what makes the tools return data. It needs `mcp:use`, which DEVELOPER,
  ADMIN and OWNER hold; MEMBER does not (the persona table does not give members assistants yet). ID tokens expire
  after about an hour.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `WAITING_ON_URL`, `ASK_YOUR_LIFE_URL`, `HOME_PULSE_URL`, `FAMILY_TREASURY_URL` | `http://localhost:8083/8086/8085/8088` | product services the tools read |
| `MCP_DOWNSTREAM_TIMEOUT` | `PT5S` | connect and read budget per downstream call |
| `APP_SECURITY_MODE` | `platform` | must stay `platform`: permissions come from platform tokens |
| `APP_PLATFORM_JWK_SET_URI` | `http://localhost:8081/.well-known/jwks.json` | where platform-token keys come from |
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | dev database | Postgres for the `mcp` schema |
| `MANAGEMENT_PORT` | `9090` | private actuator port; `dev/up.sh` uses 9190 because the dev Prometheus publishes 9090 |

## Tests

`./mvnw -B -ntp -pl mcp-server -am verify` (Docker needed: real Postgres via Testcontainers). 40 tests: protocol
(initialize and version negotiation, initialized notification, ping, tools/list schemas and annotations, unknown
tool and unknown method, GET 405, endpoint auth incl. forged and unsigned tokens, API key connect), every tool's happy
path against HTTP stubs of the product services (the caller's token is forwarded unchanged; query encoding),
permission denied for all four tools with no downstream call, API keys refused, bad input (schema and in-code),
downstream 403/404/500, one audit row per call with the right outcome and no raw arguments, a failed audit write
withholds the answer, management-port exposure, trace ids in logs and no token in logs. The gateway route is tested
in `gateway` (`McpRouteTest`).

`dev/e2e-mcp.sh` drives the real stack through the gateway (initialize, list, each tool as the owner, a denied
member, bad input, unknown tool).

## Status and limits

- Verified: the module tests above, and the gateway, auth, platform-service and sql-jooq tests touched by this
  change. Not verified: `dev/e2e-mcp.sh` has not been run against a live stack yet; no real MCP client (Claude Code
  or Desktop) has been connected; the Helm and Compose entries were rendered/validated, not deployed.
- API keys cannot read product data (see above).
- No resources, prompts, sampling or server-to-client streams: tools only, request/response.
- Tools are read-only by design; nothing here writes to a product.
- Downstream calls are sequential (item details, appliance health, household accounts), bounded by the caps above.
