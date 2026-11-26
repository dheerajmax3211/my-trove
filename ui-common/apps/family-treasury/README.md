# Family Treasury (`@platform/family-treasury`)

A shared household money pool with real accounting guarantees: a pool, a pot per member, approvals for big spends,
scheduled allowances, statements with a running balance, and a reconciliation check.

**It is bookkeeping, not a bank.** It records money a family already holds. No card, bank or payment provider is
connected and no real money ever moves. The module says so the first time each person opens it.

Backend: `family-treasury` service (port 8088). Money is `long` minor units; every money-moving POST carries an
`Idempotency-Key`.

## Run it

This package has no app or dev server of its own: the workspace mounts it at `/app/family-treasury`.

```
dev/web.sh workspace     # http://localhost:5190/app/family-treasury; add ?demo=1 for the in-memory mock (no backend)
```

Live mode needs the dev stack (`dev/up.sh`, gateway on :8080): the workspace's API client calls
`<gateway>/api/family-treasury/v1/...`. Sign-in and `VITE_*` configuration belong to the workspace (`apps/workspace`).
The workspace's demo mode uses the in-memory mock seeded with the Okafor family (USD, approval limit $100.00, plus a
small EUR household for the household switcher) and views it as the owner, Maya Okafor. The other seeded members
(Dev: approver, Sam: member, Ada: kid) are what the tests sign in as to cover each role.
Checks, from `ui-common`: `pnpm lint && pnpm typecheck && pnpm test`; the module is bundled by
`pnpm --filter @platform/workspace build`.

## As a workspace module

`src/module.tsx` exports `productModule` (id and gateway service `family-treasury`), which the workspace mounts under
`/app/family-treasury`. Every link goes through `ModuleLink` / `useModuleNavigate` / `useModulePath`, so the pages
work under any base.

- `nav` is static: "My household" (redirects to the last or only household) and "New household". A household's own
  sections (Dashboard, Move money, Activity, Approvals, Statements, Allowances, Reconciliation, Members) depend on the
  household and your role, so they are in-module navigation (`ModuleBar`), not in the workspace sidebar.
- `useTodayItems`: requests waiting for your decision (`warn`, never your own), allowances due within 3 days (`info`),
  and a reconciliation mismatch (`danger`, owners only, from a read-only `GET .../reconciliation`).
- `createDemoFetch`: the in-memory mock seeded with the Okafor household, always answering as its owner (the workspace's
  stub sign-in is not a household member). The workspace's demo mode views the ledger as Maya Okafor.
- The module imports `styles.css` itself, so its styles load wherever it is mounted.

## Screen map

```
/                         redirects to your last household, your first one, or /welcome
/welcome                  create a household (name, currency, approval limit, expiry)
/h/:id                    Dashboard: pool, member pots, pending approvals, upcoming allowances, recent activity
/h/:id/move?tab=          Move money: Deposit | Spend | Transfer | Split an expense (live exact preview)
/h/:id/activity           Ledger entries, newest first, paged; Reverse (owner/approver, with confirmation)
/h/:id/approvals          Inbox: Needs a decision | History; approve, reject with note, withdraw, expiry shown
/h/:id/allowances         Schedules per kid; create, pause, run history (PAID / SKIPPED / FAILED)
/h/:id/statement          Per account: date filter, page size, running balance, CSV export (URL holds the state)
/h/:id/reconciliation     Owner only: run the check, OK or per-account drift
/h/:id/members            Members, roles, what each role can do; owner: add member, change role, approval settings
```

Roles in the UI (the service enforces the same rules and answers 403 with a stable code):

|                                     | Owner      | Approver                      | Member                                | Kid                                   |
| ----------------------------------- | ---------- | ----------------------------- | ------------------------------------- | ------------------------------------- |
| Menu                                | everything | all but reconciliation        | all but allowances and reconciliation | My pot, Spend, My requests, Statement |
| Deposit / transfer / split          | yes        | yes                           | deposit, transfer out of own pot      | no                                    |
| Approve or reject (never your own)  | yes        | yes                           | no (can withdraw their own)           | no                                    |
| Reverse, allowances, reconciliation | yes        | reverse; allowances read-only | no                                    | no                                    |

## How the guarantees show up in the UI

- **Idempotency.** Each form instance (a form open, an approval card, a reverse dialog) owns one `Idempotency-Key`
  (`useIdempotentMutation`). A double click or a retry after a lost response sends the same key, so the server replays
  instead of posting twice; submits are also ignored while one is in flight. The key is replaced after a success or after
  a `409 IDEMPOTENCY_KEY_REUSED`, which is explained in plain words.
- **Exact money.** No floats: amounts are integer minor units end to end. `lib/money.ts` parses and formats with
  decimal strings and `Intl`, and implements the backend's largest-remainder allocation with BigInt (ties go to the lowest
  index). The split preview uses it, so the preview is the posting; tests check it against known vectors and 2,000
  pseudo-random cases.
- **Errors.** `lib/errors.ts` maps backend codes (`INSUFFICIENT_FUNDS`, `ALREADY_REVERSED`, `SELF_APPROVAL`,
  `ALREADY_DECIDED`, `LAST_OWNER`, ...) and network failures to readable messages, tied to a field where there is one.

## Mocked vs real

- Mock (demo mode and all tests): `src/mock/*`, a hand-written port of the Java service's behaviour (ledger postings,
  overdraft rule, approvals with expiry, reversal rules, idempotency replay / 409, statement running balance, CSV quoting,
  reconciliation, allowance validation, role checks, problem+json with `code`). Written from the controllers and
  services, not from a running service.
- Real: everything else. In live mode the module uses only the API client the workspace gives it.

## Honest limitations

- **Not verified against the real service or Firebase.** No end-to-end run against the Spring service, Postgres or the
  Firebase emulator happened; the mock mirrors the Java source, so a drift between the two would only show up there.
  Nothing was checked in a real browser either: layout, responsiveness (375px) and dark mode rely on the shared tokens and
  components and have not been looked at by these tests, which run in jsdom (the workspace's `dev/qa/` scripts check
  layout in a real browser).
- The allowance run log from the backend is only `"<date> <STATUS>"`; it carries no reason text. The UI shows the
  documented reason for each status (skipped: missed period, only the latest is paid; failed: could not be funded, not
  retried). The service has no resume: "Pause" is its `DELETE`, so continuing means creating a new schedule.
- The mock has no allowance scheduler: runs are seeded, new schedules do not produce runs.
- Reconciliation is owner-only in the UI by product decision; the service also allows approvers.
- Kids: the UI shows only the kid's own pot, requests and statement. The service itself still lets a kid read
  household-level accounts (pool, categories) through `/accounts`; that is a UI simplification, not an access boundary.
- Adding a member needs their Firebase uid (the service has no lookup); the Members page shows your own for sharing.
- No UI for creating extra accounts or expense categories (the service supports it).
- Entries are offset-paged without a total (service limitation). Statement date filters use the local day, sent as UTC
  instants; allowance dates are UTC calendar dates.
- Real-time updates: none (no polling or push); data refreshes on navigation and after your own actions.
