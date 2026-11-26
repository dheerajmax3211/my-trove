# Waiting On (workspace module)

Package `@platform/waiting-on`, mounted by the workspace at `/app/waiting-on`.

Tracks the things you are waiting for from other people: refunds, insurance claims, expense reimbursements,
approvals, deliveries. Every item carries a follow-up schedule that the `waiting-on` service runs for weeks
(friendly nudge, formal escalation letter, optional final notice, then expiry). This module is the front end for
that service (`/v1/items/**`, port 8083).

## Screens

```
/                  Waiting list     summary band, items grouped by urgency, filters, first-run guidance
/new               Add something    form + live explanation of the follow-up schedule it will create
/items/:id         Item             details, live follow-up status, actions, reply address, draft letters, timeline
*                  Not found
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
`<gateway>/api/waiting-on/v1/...`). All links use `ModuleLink`, `ModuleNavLink` and `useModuleNavigate`, so the
pages work under any base. The workspace supplies sign-in, the API client, theme and toasts, and sets
`data-product="waiting-on"` around the module (the product accent).

## Run it

This package has no app or dev server of its own: the workspace mounts it at `/app/waiting-on`.

```
dev/web.sh workspace     # http://localhost:5190/app/waiting-on; add ?demo=1 for the in-memory mock (no backend)
```

Live mode needs the dev stack (`dev/up.sh`, gateway on :8080): the workspace's API client calls
`<gateway>/api/waiting-on/v1/...`. Sign-in and `VITE_*` configuration belong to the workspace (`apps/workspace`).
The workspace's demo mode serves an in-memory mock of the service with seven items in different states (plus one
owned by someone else, to show the 404 behaviour); state resets on reload.
Checks, from `ui-common`: `pnpm lint && pnpm typecheck && pnpm test`; the module is bundled by
`pnpm --filter @platform/workspace build`.

## Layout

```
src/
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
  testing/      harness: mounts the module as the workspace does (fixed clock, request log, failure injection)
```

## Mocked vs real

The mock follows the real contract as read from `ItemController` and `ItemService`: same paths and statuses,
RFC 9457 problem documents, 404 for another user's item, 409 when closing a closed item, 400 for validation
(the service's generic "Invalid request content." for bean-validation failures and its specific messages for
amount-without-currency and bad plan order), `limit` clamped to 1..100, timeline oldest first, `followUp` and `nextStep` on
every item response (the mock computes `nextStep` from its simulated workflow, so its `source` is always `WORKFLOW`). Letter text is a condensed port of the template engine. Time does not pass in the
mock: items never advance from OPEN to NUDGED by themselves, and inbound replies do not exist.

## Tests

`pnpm test` at the repo root runs them. They mount the module the way the workspace does, against the mock with a
fixed clock: first use,
filters, create (including client and server validation), customised schedule, item page, timeline order, live
follow-up, snooze, resolve, cancel confirmation, letters per stage with clipboard, reply address, 404 for another
user's item, list failure with retry, network failure, 409, 401 signs the session out. Separate tests cover the API layer
(request shapes, error mapping) and the pure logic (plans, validation, dates, error text).

## Limitations

- The "Next:" line and the home summary show the service's `nextStep`. When Temporal does not answer, the service
  falls back to the stored plan (`source: PLAN`, ignores snoozes) and the card says "estimated from the plan".
- The service has no category filter, total count or search; the category filter works on the loaded page and
  "Show more" re-requests with a larger `limit` (100 per step).
- The service answers validation failures without field names, so a rejected create shows a form-level message;
  field errors appear only if the service starts sending an `errors` member.
- Letters are drafted for the user to send; the service does not email anything yet, and the app says so.
- Not verified here: the real service end to end, Firebase sign-in, the 375px layout and dark mode by eye (they use
  only tokens). Inside the workspace these are covered by the workspace's own checks (`dev/qa/`).
