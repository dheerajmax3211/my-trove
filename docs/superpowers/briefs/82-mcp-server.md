# 82: MCP server module

Read `80-common.md` first. Report: `docs/superpowers/briefs/82-report.md`.

Build `mcp-server`, a new Maven module (Spring Boot 4.1.2, servlet) that exposes My-Trove to AI agents over the Model
Context Protocol, consent-scoped and audited. This is spec item Phase 3.F
(`docs/superpowers/specs/2026-11-21-trove-platform-v2-design.md`, read the MCP and consent sections).

Requirements:
- Protocol: MCP Streamable HTTP transport (JSON-RPC 2.0 over POST, protocol version 2025-06-18 or the newest the SDK
  supports): `initialize`, `tools/list`, `tools/call`, `ping`. Use the official MCP Java SDK
  (`io.modelcontextprotocol.sdk:mcp`, pin an exact released version, check Maven Central) if it works on Boot 4;
  otherwise implement the small JSON-RPC surface by hand (say which in the report). No Spring AI.
- Auth: every call carries a platform credential via the gateway (the gateway exchanges it into a platform token; look
  at how other services validate platform tokens with `libs/platform-security`). Add a gateway route `mcp` ->
  `/api/mcp/**` (gateway `application.yml` + GatewayProperties default ports; port 8090, management 9090). An API key
  should be able to call it too: add `api-key-routes` entries with a new permission `mcp:use`, and add `mcp:use` to the
  permission catalogue and seed roles (look at auth's RBAC migrations and the platform-service scope catalogue) for
  DEVELOPER, ADMIN and OWNER, and MEMBER if the spec's persona table says members may use assistants.
- Tools (read-only, each calls the owning service through the gateway or directly with the caller's token, never with
  elevated credentials): `waiting_on_list_followups` (open items with status and next step), `ask_your_life_search`
  (query -> top passages with document titles), `home_pulse_appliance_status` (appliances with health and open
  alerts), `family_treasury_ledger_summary` (balances per account for a household the caller belongs to). Each tool has
  a JSON input schema, validates input, and returns MCP `content` text plus `structuredContent`.
- Consent scoping: a tool runs only if the caller's token carries the permission that product needs (reuse the
  existing permission names, e.g. `products:use`); otherwise the tool result is an MCP error, not data.
- Audit: every `tools/call` writes an audit row (who, tool, arguments hash, result size, outcome, time) in a new
  `mcp` schema (Flyway migration in `sql-jooq`, following the per-schema folder layout and jOOQ generation used by
  other services). Add the schema to the jOOQ generator config the same way the others are.
- Observability like the other services: private management port 9090, Prometheus, OTLP, `ManagementPortGuard`,
  `ObservabilityExposureTest` (copy the pattern from a servlet service, e.g. shared-service).
- Wire it in: root `pom.xml` modules, `dev/up.sh` (port 8090), `deploy/helm/my-trove/values.yaml` services map and
  `_helpers.tpl` env if needed, `deploy/compose/compose.yaml`, `.github/workflows/release.yml` image matrix and kind
  image lists, `deploy/kind/values-kind.yaml`, `dev/observability/prometheus.yml` scrape job.
- Tests: protocol tests (initialize, tools/list schema, tools/call happy path with stubbed downstream services,
  permission denied, bad input, unknown tool), audit rows written, gateway route test in the gateway module, and an
  end-to-end script `dev/e2e-mcp.sh` (curl through the gateway with a dev-IdP token: initialize, list, call each
  tool, denied call) that you run against the live stack only if one is up; otherwise say it is not run.
- Docs: `mcp-server/README.md` (how to connect an MCP client, e.g. a config snippet for Claude Desktop/Code using
  an API key), add a row to the root README module table.
