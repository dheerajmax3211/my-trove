# Waiting On (web app)

Package `@platform/waiting-on`, dev port **5182**.

Tracks the things you are waiting for from other people: refunds, insurance claims, expense reimbursements,
approvals, deliveries. Every item carries a follow-up schedule that the `waiting-on` service runs for weeks
(friendly nudge, formal escalation letter, optional final notice, then expiry). This app is the front end for
that service (`/v1/items/**`, port 8083).

## Screens

```
/                  Waiting list     summary band, items grouped by urgency, filters, first-run guidance
/new               Add something    form + live explanation of the follow-up schedule it will create
/items/:id         Item             details, live follow-up status, actions, reply address, draft letters, timeline
*                  Not found
(signed out)       Sign in          Google or email link (stub in demo mode)
```

- **Waiting list (home)**: a dark summary band (how many items are past their date, open items, overdue, the next
  follow-up and who it goes to), then the active items grouped by urgency: Overdue, Due soon (within 7 days), Later,
  and a short Recently closed list. Each row shows status, an overdue indicator in words, a small gauge of how many
  follow-up letters have been reached, the next scheduled step and the outcome for closed items. Status filter
  (Active by default, All, or any single status; sent as repeated `status` parameters) and category filter (applied
  in the browser). Filters live in the address (`?status=RESOLVED&category=REFUND`). A user who has never added
  anything sees first-run guidance: what the product does, the default schedule of a refund, and a note that the
  user sends the letters.
- **Add item**: title, counterparty, optional email, category, optional amount and currency, expected-by date.
  The schedule card recomputes as you type, using the service's per-category defaults (offsets from the expected
  date). "Customise the follow-up schedule" exposes the four day offsets, validated with the same ordering rules as
  the service. Client validation focuses the first invalid field; server field errors are shown when sent.
- **Item**: live stage and next action time (from the workflow query), Resolve (optional outcome), Snooze
  (1 to 90 days), Cancel tracking (confirmation dialog). Closed items disable all three and say why. The reply
  address has a copy button and a plain explanation of forwarding replies. "Draft letters" previews NUDGE,
  ESCALATION and FINAL_NOTICE as of today with copy-to-clipboard. "The follow-up plan" lists every step with its
  date (snoozes included) and marks the ones reached and the next. The timeline is newest first, with long letters
  collapsed.

## As a workspace module

`src/module.tsx` exports `productModule` (`@platform/workspace-kit`): `Routes` (`src/routes.tsx`, paths relative),
`Providers` (the clock), `nav`, `useTodayItems` (`src/today.ts`: overdue items, items due within 3 days and items
whose next follow-up is within 3 days, most urgent first) and `createDemoFetch` (the in-memory mock, reachable at
`<gateway>/api/waiting-on/v1/...`). All links use `ModuleLink`, `ModuleNavLink` and `useModuleNavigate`, so the same
pages run standalone (empty base) and under `/app/waiting-on`. The standalone `App.tsx` wraps the same routes in its
own layout with `data-product="waiting-on"` on its root.

## Run it

Demo mode needs nothing but the workspace:

```
pnpm install
pnpm --filter @platform/waiting-on dev        # http://localhost:5182
```

Demo mode signs you in as the stub demo user and serves an in-memory mock of the service with seven items in
different states (plus one owned by someone else, to show the 404 behaviour). State resets on reload.

Against the real service:

1. Start Postgres, a Temporal dev server (or set `TEMPORAL_ENABLED=false`) and the service on port 8083 (see the
   service README).
2. Create `apps/waiting-on/.env.local` from `.env.example` with a Firebase project (or only
   `VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` for the emulator).
3. `pnpm --filter @platform/waiting-on dev`. Vite proxies `/api/*` to `http://localhost:8083/*`.

## Environment

| variable                                                                                                 | meaning                                                         |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `VITE_USE_MOCK=true`                                                                                     | force demo mode even when Firebase is configured                |
| `VITE_API_BASE_URL`                                                                                      | service base URL, default `/api` (the dev proxy)                |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_APP_ID` | Firebase web config                                             |
| `VITE_FIREBASE_AUTH_EMULATOR_HOST`                                                                       | `host:port` of the Auth emulator (enables real mode on its own) |

Demo mode is the default whenever Firebase is not configured. Production hosting must serve `index.html` for
unknown paths (the app uses browser history routing) and route `/api` to the service.

## Layout

```
src/
  App.tsx, main.tsx, runtime.ts      providers and demo/real wiring
  auth/                              sign-in screen
  layout/                            standalone AppShell frame (the workspace has its own)
  module.tsx, routes.tsx, today.ts   the workspace module, relative routes, Today feed
  lib/                               dates, clock, error text, clipboard
  components/                        CopyButton, ErrorState
  features/items/
    api/        wire types, paths, cache keys
    hooks/      useApiQuery / useApiMutation wrappers
    logic/      pure code: default plans, plan validation, form validation, overdue
    components/ rows, forms, cards, dialogs, timeline, letters
    pages/      ItemsPage, NewItemPage, ItemDetailPage, NotFoundPage
  mock/         in-memory service (backend.ts), letter templates, seed data
  testing/      render harness (fixed clock, request log, failure injection)
```

## Mocked vs real

The mock follows the real contract as read from `ItemController` and `ItemService`: same paths and statuses,
RFC 9457 problem documents, 404 for another user's item, 409 when closing a closed item, 400 for validation
(the service's generic "Invalid request content." for bean-validation failures and its specific messages for
amount-without-currency and bad plan order), `limit` clamped to 1..100, timeline oldest first, `followUp` and `nextStep` on
every item response (the mock computes `nextStep` from its simulated workflow, so its `source` is always `WORKFLOW`). Letter text is a condensed port of the template engine. Time does not pass in the
mock: items never advance from OPEN to NUDGED by themselves, and inbound replies do not exist.

## Tests

`pnpm test` at the repo root runs them. They render the whole app against the mock with a fixed clock: first use,
filters, create (including client and server validation), customised schedule, item page, timeline order, live
follow-up, snooze, resolve, cancel confirmation, letters per stage with clipboard, reply address, 404 for another
user's item, list failure with retry, network failure, 409, 401 sign-out. Separate tests cover the API layer
(request shapes, error mapping) and the pure logic (plans, validation, dates, error text).

## Limitations

- The "Next:" line and the home summary show the service's `nextStep`. When Temporal does not answer, the service
  falls back to the stored plan (`source: PLAN`, ignores snoozes) and the card says "estimated from the plan".
- The service has no category filter, total count or search; the category filter works on the loaded page and
  "Show more" re-requests with a larger `limit` (100 per step).
- The service answers validation failures without field names, so a rejected create shows a form-level message;
  field errors appear only if the service starts sending an `errors` member.
- Letters are drafted for the user to send; the service does not email anything yet, and the app says so.
- Not verified: the real service end to end, Firebase sign-in, a real browser, the 375px layout and dark mode by
  eye (they use only tokens and the responsive shell, but were not looked at). The production bundle is about
  600 kB because Firebase is included.
