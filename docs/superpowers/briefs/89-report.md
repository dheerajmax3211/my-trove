# 89 report: Trove Assistant in the workspace (spec 4.C)

Status: **DONE**. I worked in the main checkout on `main`, committed there and did not push. I ran no `pnpm install`,
added no dependencies and ran no Maven.

## What was built

The assistant is a panel in the workspace (`ui-common/apps/workspace/src/assistant/`). It answers questions by calling
mcp-server's four tools through the gateway: `POST /api/mcp/mcp`, JSON-RPC 2.0, MCP Streamable HTTP.

- **Routing with no model** (`intent.ts`). Fixed word rules, checked in order, using whole words only and ignoring
  case. The panel says it is not an AI model, and lists the rules under "How it picks a product".
  - "waiting on/for", "follow-up(s)", "owed" → `waiting_on_list_followups`
  - "appliance", "fridge", "freezer", "power", "alert" → `home_pulse_appliance_status`
  - "balance", "ledger", "money", "household account", "treasury" → `family_treasury_ledger_summary`
  - anything else → `ask_your_life_search`, with the question as typed (trimmed, capped at 500 characters)
- **Live transport** (`transport.ts`). The workspace's own API client sends one `tools/call` per question to
  `${apiBase}/mcp/mcp`, using the person's own token (the gateway exchanges it).
  - Headers: `Accept: application/json, text/event-stream` and `MCP-Protocol-Version: 2025-06-18`.
  - mcp-server is stateless, so no `initialize` or session is needed. I checked this with curl against the live
    stack. An event-stream body is also read.
- **Answers** (`answers.tsx`). Each answer is labelled with its product ("From Waiting On", and so on) and built from the
  tool's `structuredContent`:
  - **Waiting On:** each item, linked to `/app/waiting-on/items/:id`, with its counterparty, status, expected date,
    amount, and next step with its date.
  - **Ask Your Life:** the best passage as a `<blockquote>`, citing the document title in `<cite>`; the other matching
    titles; and a link to the full search (`/app/ask-your-life?q=`).
  - **Home Pulse:** a sentence on what needs attention, then each appliance linked to `/app/home-pulse/appliances/:id`,
    with a health badge and its open alert messages.
  - **Family Treasury:** every account balance, linked to `/app/family-treasury/h/:id`. When the person belongs to more
    than one household, it asks "Which one?" with a button per household, and a choice calls the tool again with
    `householdId`. If the question already names a household, it does not ask.
  - Each answer type has an empty-state sentence.
  - Parsing is defensive: rows it cannot read are skipped, and an unreadable answer shows a sentence instead of breaking
    the page.
- **Errors read as sentences.** The transport never throws.

  | What came back | What the panel says |
  |---|---|
  | `forbidden`, `downstream_denied`, `delegation_refused` | "You don't have permission to read <product>…" |
  | `not_found` | "<product> couldn't find that." |
  | `invalid_input`, `downstream_rejected`, JSON-RPC -32602/-32601 | "couldn't take that question as asked" |
  | `unavailable`, `internal`, 5xx, network failure | "isn't answering right now" or "can't reach My-Trove right now" |
  | gateway 403 | "Your account isn't allowed to use the assistant" |
  | 401 | sign in again |
  | 429 | "Too many questions at once" |

- **Who sees it.** Only a session with `mcp:use` sees the assistant. There is no teaser for anyone else: no header
  button, no palette entry, and the panel is not mounted.
  - To make this work I added `mcp:use` to the workspace persona table (`lib/personas.ts`) for DEVELOPER, ADMIN and
    OWNER, the same grants auth makes. I also gave it a label and a group. Live sessions read permissions from
    `/auth/v1/me`, which already carried `mcp:use` for the owner.
- **Keyboard and focus.**
  - The panel opens from the header "Ask" button (accessible name "Ask the assistant") and from ⌘K "Ask the assistant".
  - It is a modal `Dialog` that traps focus. Focus starts in the question box, Escape closes it, and focus goes back to
    the header button (the panel has no Radix trigger, so the shell restores focus itself).
  - A link in an answer closes the panel and navigates.
  - The answers list is `aria-live="polite"`.
- **Footer.** Live mode: "Each question is recorded in your audit log." Demo mode says honestly that answers come from
  made-up data and nothing is sent or recorded.
- **Demo mode (`?demo=1`)** (`demoTransport.ts`). Each tool is mirrored in the browser over the API clients the
  workspace already gives each product module in demo mode, which are the products' own mock APIs. They return the same
  `structuredContent` shape, so the same renderers are used.
  - One deliberate difference: the Ask Your Life mock is keyword-only. When a whole question finds nothing, the demo
    retries with `word OR word …`. Live mode never does this.
- **Docs.** I added a paragraph on the Trove Assistant to `ui-common/apps/README.md`, and documented
  `dev/e2e-assistant.mjs` in `dev/README.md`.

## Files

- New:
  - `ui-common/apps/workspace/src/assistant/{intent.ts, tools.ts, transport.ts, demoTransport.ts, answers.tsx, AssistantPanel.tsx, Assistant.module.css, fixtures.ts}`
  - their tests: `{intent,transport,demoTransport}.test.ts`, `{answers,assistant}.test.tsx`
  - `dev/e2e-assistant.mjs`
- Changed:
  - `shell/WorkspaceShell.tsx`: header button, panel, focus return
  - `shell/CommandPaletteHost.tsx`: the `onAskAssistant` action
  - `lib/personas.ts` and its test: `mcp:use`
  - `ui-common/apps/README.md`, `dev/README.md`

## Tests

Vitest, 75 new tests in `apps/workspace/src/assistant`, all passing, plus 1 new persona test:

| File | Tests | What it covers |
|---|---|---|
| `intent.test.ts` | 27 | The routing table: 20 questions, rule order, case and spacing, word boundaries, query trimming and the 500-character cap, an empty question, household-name matching. |
| `transport.test.ts` | 13 | Request shape: URL, POST, bearer token, Accept, `MCP-Protocol-Version`, JSON-RPC body. An event-stream body. Every tool error code. HTTP 401/403/429/503. A network failure. A JSON-RPC error. An unreadable body. |
| `answers.test.tsx` | 17 | Each tool's rendering, using `structuredContent` captured from the live stack: links, quote and cite, health badges, balances. Empty states. The household chooser. A household named in the question. Unreadable answers for all 4 tools. Malformed rows. |
| `demoTransport.test.ts` | 3 | All 4 tools against the real product mock APIs, parsing into the same shapes, with `fetch` stubbed to fail. Refusal and missing-module sentences. Formatting helpers. |
| `assistant.test.tsx` | 15 | Gating: MEMBER and AUDITOR see nothing; DEVELOPER, ADMIN and OWNER see the button and palette entry; a live session without `mcp:use` sees nothing; a member makes no MCP call. Header opening with focus in the box, Escape, focus return. Palette opening. Not-a-model description and an empty question. Live: tool called with the person's token, "From Waiting On", audit footer, a link navigates and closes. Household chooser makes a second call with `householdId`. 503, `forbidden` and an empty search as sentences while the panel keeps working. Gateway 403. Demo: all 4 tools answered from mock APIs with no network call. |

- `pnpm lint`: green
- `pnpm typecheck`: green
- `pnpm test`: **201 files, 2301 tests, 0 failures**
- `pnpm -r build`: green

**Live run of `dev/e2e-assistant.mjs`, 2026-11-27: 12 passed, 0 failed.** It ran against the running stack and the
workspace on :5190 in headless Chromium.

- As the owner:
  - The header button opens the panel with focus in the box, and the footer shows the audit line.
  - Waiting On ("You're waiting on 2 things") answered.
  - Home Pulse ("2 of 2 appliances need attention") answered.
  - Family Treasury asked "Which one?" across 4 households; choosing "The Rao family" showed its balances.
  - Ask Your Life answered "When does my passport expire?" with the "Passport renewal" quote.
  - All 5 MCP calls returned 200 with a bearer token, and `mcp.tool_calls` grew by exactly 5 rows.
  - The "Open Waiting On" link navigated and closed the panel. ⌘K → "ask the assistant" opened it and Escape closed it.
  - There were no page errors and no failed gateway calls.
- As the member: no button and no palette entry.

Run command:

```
PLAYWRIGHT_CORE=~/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core/index.mjs \
QA_CHROMIUM=~/Library/Caches/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-mac-arm64/chrome-headless-shell \
node dev/e2e-assistant.mjs
```

I used the existing `QA_CHROMIUM` override because the playwright-core build expected a Chromium revision that is not
installed. I took a screenshot to check the layout.

## Not done or not verified

- **Not checked:**
  - mobile width
  - dark theme
  - a screen reader
  - the demo mode in a real browser (it is covered by Vitest only)
- **Side effect of the live run:** 5 extra `mcp.tool_calls` rows for the owner in the shared dev database (append-only
  by design). No product data was written; the tools are read-only.

## Decisions

- **One `tools/call` per question, with no `initialize` handshake.** The server is stateless (82 report), and this
  halves the calls. The protocol version is still named in its header.
- **Household choice.** A household named in the question is used from the first answer. A button choice makes a fresh,
  audited call with `householdId`, so the answer shown is what the tool returned for that household.
- **The suggestions work in both modes.** The Ask Your Life suggestion is "When is my dentist appointment?" because both
  the live seed and the demo seed have a dentist note.
- **`mcp:use` in the frontend persona table.** It had been left out since brief 82 (that report's concern 5). Without it,
  demo personas could never show the assistant.

## Commits

- `d2ae6fd` workspace: personas carry mcp:use (DEVELOPER, ADMIN, OWNER), as auth grants it
- `5ecebdd` workspace: Trove Assistant over the MCP tools (spec 4.C)
- `49c05d5` dev: e2e-assistant.mjs, the Trove Assistant in a real browser against the live stack
- (this report)
