# 82 report: MCP server module

Status: **DONE_WITH_CONCERNS** (concern 1 below: API keys can connect but cannot read product data).
Branch: `worktree-agent-ac3830ce73a7c15d1` (worktree fast-forwarded to `9540b5a` first, because it was cut one commit
before the briefs existed).

## What was built

`mcp-server`, a new Maven module (Boot 4.1.2, servlet, port 8090, management 9090) exposing four read-only,
consent-scoped, audited MCP tools.

- **Protocol: official SDK, not hand-rolled.** `io.modelcontextprotocol.sdk:mcp` pinned to **2.1.0** (released
  2026-10-15; 2.2.0 is from 2026-11-13, under two weeks old, so not taken). It uses Jackson 3 (`mcp-json-jackson3`),
  matching Boot 4, and worked without workarounds. Transport: the SDK's stateless Streamable HTTP servlet
  (`HttpServletStatelessServerTransport`) at `/mcp`, JSON responses, no sessions (any replica answers). Methods:
  `initialize`, `notifications/initialized` (202), `ping`, `tools/list`, `tools/call`; `GET /mcp` is 405. Protocol
  versions negotiated: 2025-06-18 and 2025-11-25 tested. No Spring AI.
- **Auth.** Default platform-security decoder (platform tokens), own filter chain: `/mcp` needs `mcp:use`, health is
  public, every other path on the main port is denied, error dispatches keep their status; actuator chain for the
  private management port. Caller (sub, USER/API_KEY, permissions, token) is captured on the request thread by the
  SDK's context extractor and passed to tools through the MCP transport context.
- **Tools** (`waiting_on_list_followups`, `ask_your_life_search`, `home_pulse_appliance_status`,
  `family_treasury_ledger_summary`): each has a JSON input schema (`additionalProperties: false`, bounds), read-only
  annotations, SDK schema validation plus in-code checks, `content` text plus `structuredContent`. They call the
  product services **directly with the caller's own platform token** (the gateway can't re-exchange a platform
  token, so "through the gateway" was not possible). Downstream 401/403 -> `downstream_denied`, 404 -> `not_found`,
  other 4xx -> `downstream_rejected`, 5xx/timeout -> `unavailable`, all as MCP tool errors.
  Adaptations to the real APIs: Waiting On's list has no workflow state, so each item's detail is read (limit <= 20);
  Home Pulse health is read per appliance (cap 25); Treasury's household list carries no accounts, so
  `/households/{id}/accounts` is read per household (cap 10); search snippets are turned into plain text.
- **Consent scoping.** Each tool requires `products:use` (the existing product permission). Missing -> tool error
  `forbidden` with `requiredPermission`, no downstream call. API-key (service) tokens are also refused with
  `api_key_not_supported` (see concern 1).
- **Audit.** New `mcp` schema: `sql-jooq/.../mcp/V1__mcp_audit.sql` (`mcp.tool_calls`: principal type/id, tool,
  SHA-256 of canonical key-sorted arguments, result bytes, outcome OK/DENIED/INVALID/UNKNOWN_TOOL/ERROR, error code,
  duration, time) and `mcp_ext/V100` (append-only trigger). jOOQ execution `generate-mcp` + build-helper source added
  like the others. Auditing sits in a wrapper around the SDK's transport handler, so unknown tools and
  schema-rejected arguments are audited too. If the audit write fails the answer is withheld (fail closed).
- **Observability.** Prometheus, OTLP tracing, `ManagementPortGuard` (+ test), `ObservabilityExposureTest`, copied
  from shared-service.
- **Permission catalogue.** `auth` migration `V5__mcp_permission.sql` adds `mcp:use` to DEVELOPER, ADMIN, OWNER and
  bumps those users' `permissions_version`; `Permission.MCP_USE`. **Not MEMBER**: the persona table (design 5.2)
  does not say members may use assistants. platform-service `ScopeCatalogue` gains the key scope `mcp:use` ->
  `mcp:use`.
- **Gateway.** Route `mcp` -> `http://localhost:8090` in `GatewayProperties.DEFAULT_PORTS`; default required
  permission `mcp:use`; `api-key-routes` entry `POST /mcp` needs `mcp:use`; yml comments updated.
- **Wiring.** Root `pom.xml` module; `dev/up.sh` (mcp-server:8090, before the gateway); Helm `values.yaml` +
  `_helpers.tpl` (gateway service JSON gets `mcp`, mcp-server gets the four product URLs); `deploy/kind/values-kind.yaml`;
  `deploy/compose/compose.yaml` (service + gateway JSON); `release.yml` image matrix and both kind image lists;
  `dev/observability/prometheus.yml` scrape job; `service.Dockerfile` comment.
- **Docs.** `mcp-server/README.md` (architecture, tools, Claude Code `.mcp.json` / `claude mcp add` and Claude
  Desktop via `mcp-remote` snippets, what token to use, config, tests, honest limits); root README layout row.
- **E2E script.** `dev/e2e-mcp.sh` (through the gateway with dev-IdP tokens: no token 401, member without mcp:use
  403, owner ping/initialize/version/tools/list, each tool as owner, bad input, unknown tool).

## Tests (all run, all passing)

| Module | Result | New / changed |
|---|---|---|
| mcp-server | 40 tests, 0 failures | new: ProtocolTest 11, ToolCallTest 14, ToolInputTest 7, ObservabilityExposureTest 3, ManagementPortGuardTest 4, AuditFailureTest 1 |
| sql-jooq | 75, 0 failures | new McpSchemaTest 2; SchemaMigrationTest counts 19 -> 20 and asserts who holds mcp:use |
| gateway | 144, 0 failures | new McpRouteTest 5; RoutingTest covers mcp (prefix strip, default port, default permission) |
| auth | 83, 0 failures | RbacTest matrix and AdminApiTest role counts include mcp:use |
| platform-service | 132, 0 failures | ApiKeysTest: catalogue lists `mcp:use`; an mcp key carries exactly `mcp:use` (new test) |
| platform-security | 45, 0 failures | unchanged (ran as a dependency) |

Command used: `./mvnw -B -ntp -pl <module> -am verify` with the Colima Docker env. The full reactor was **not** run
(every touched module was); untouched services only gain an `auth` migration they do not read.
Also checked: `helm lint` / `helm template` with the kind values renders the mcp-server Deployment and env;
`docker compose config` on the Compose file passes; `bash -n` on both scripts.

**Not run:** `dev/e2e-mcp.sh`. No full stack was up (auth on 8081 and the dev IdP on 9100 were answering, from
another checkout and without the new migration; the gateway and mcp-server were not running), and I did not start
one beside other agents' processes. No real MCP client was connected.

## Concerns and decisions

1. **API keys cannot read product data.** The brief asks that an API key can call the MCP server; it can (gateway
   route + `mcp:use` scope + tests): `initialize`, `ping`, `tools/list`. But a key's token is a service token
   (`sub = app:<appId>`, permissions from the key only, never its owner, design 5.3), and products key data by the
   person's uid, so forwarding it would read an empty or wrong principal. No scope grants `products:use`. So tools
   refuse keys (`forbidden` without `products:use`, else `api_key_not_supported`). Making keys act for their owner is
   a token-model change in `auth` (and a consent decision), outside this brief. People get data with their own
   sign-in token (DEVELOPER/ADMIN/OWNER). Documented in the README.
2. MEMBER does not get `mcp:use` (persona table is silent on assistants); trivial to add in a later migration when
   4.C (Trove Assistant) opens to members.
3. Dev port clash: Prometheus in `dev/docker-compose.yml` publishes host port 9090, so `dev/up.sh` gives mcp-server
   management port **9190** and the dev scrape job targets 9190. Containers (Compose, Helm, kind) use 9090 as briefed.
4. Gateway route policy: the `mcp` route requires `mcp:use` by default (like product routes require `products:use`);
   mcp-server re-checks it.
5. Frontend permission/scope lists (`ui-common/.../catalogue.ts`, workspace demo data) were not updated; out of
   scope, and no frontend test depends on the backend count. The tracker was not edited (coordinator's file).
6. Files outside the module touched because tests required it: `auth/src/test/.../AdminApiTest.java` (role counts).

## Commits

- `0bd29d1` sql: mcp schema with append-only tool-call audit; auth: mcp:use permission for DEVELOPER, ADMIN, OWNER
- `77846c0` mcp-server: consent-scoped, audited MCP tools over the official Java SDK (stateless Streamable HTTP)
- `6d44e25` gateway: mcp route (/api/mcp -> :8090, needs mcp:use) and an API-key route for POST /mcp
- `a20dd94` platform: mcp:use API-key scope; auth: admin roles test counts include mcp:use
- `0a4c2a7` deploy: wire mcp-server into up.sh, Compose, Helm, kind, release images and the dev Prometheus
- `ca5f72b` docs: mcp-server README (client config, consent, audit, limits); dev/e2e-mcp.sh through the gateway
- (this report)
