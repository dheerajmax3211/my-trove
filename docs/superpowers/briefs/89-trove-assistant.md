# 89: Trove Assistant in the workspace (spec 4.C), over the MCP server

Read `80-common.md` first. Report: `docs/superpowers/briefs/89-report.md`. You work in the main checkout on `main`
(node_modules installed; do not run `pnpm install` or add dependencies), commit directly to main, never push, never
run `./mvnw verify` or `package` (they rewrite the jars the live stack is running: use `./mvnw test` if you touch Java).

Build an assistant panel in the workspace that answers everyday questions by calling the MCP server's tools with the
signed-in person's own token, through the gateway (`POST /api/mcp/mcp`, JSON-RPC 2.0, MCP Streamable HTTP; read
`mcp-server/README.md` for the exact headers, protocol version and tool names and input schemas, and
`docs/superpowers/briefs/82-report.md` and `86-report.md`).

There is no generative model, and the assistant must not pretend there is one:
- Route each question to a tool by explicit, tested intent rules (what am I waiting on / follow-ups -> Waiting On;
  appliance, fridge, power, alert -> Home Pulse; balance, ledger, money, household account -> Family Treasury, asking
  which household when there is more than one; anything else -> Ask Your Life search). Show which tool answered
  ("From Waiting On") and render the tool's `structuredContent` as a readable answer with links into the product
  pages; Ask Your Life answers show its cited quote.
- Visible only when the session has `mcp:use` (DEVELOPER, ADMIN, OWNER today); others see nothing (no teaser).
- Every call is audited by the MCP server already; say so in the panel's footer ("Each question is recorded in your
  audit log").
- Errors read as sentences (permission refused, service down, nothing found) and never break the page.
- Keyboard: open from the command palette (⌘K "Ask the assistant") and a header button; Escape closes; focus managed.
- Demo mode (`?demo=1`): answer from the products' mock APIs (no network), so the public demo can show it.
Tests (Vitest): intent routing table, each tool's rendering, permission gating, error states, demo mode makes no
network calls. Live: with the dev stack up (it is), sign in as the owner in a real browser (dev/qa/lib.mjs helpers,
PLAYWRIGHT_CORE as in dev/README.md) and ask one question per tool; add this as `dev/e2e-assistant.mjs` and report its
result. Then `pnpm lint && pnpm typecheck && pnpm test && pnpm -r build` green.
