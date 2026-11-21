# Family Treasury (`@platform/family-treasury`)

A shared household money pool with real accounting guarantees: a pool, a pot per member, approvals for big spends,
scheduled allowances, statements with a running balance, and a reconciliation check.

**It is bookkeeping, not a bank.** It records money a family already holds. No card, bank or payment provider is
connected and no real money ever moves. The app says so the first time each person opens it, and again in the sidebar.

Backend: `family-treasury` service (port 8088). Money is `long` minor units; every money-moving POST carries an
`Idempotency-Key`.

## Run it

Demo mode needs nothing but the install: an in-memory mock of the API (same paths, status codes, problem codes and
idempotency semantics as the real service) plus a persona picker instead of Firebase sign-in.

```bash
pnpm install
pnpm --filter @platform/family-treasury dev      # http://localhost:5187
```

Pick a person on the sign-in screen, then use "Acting as" in the top bar to switch between them without signing out. The
seeded household is the Okafor family (USD, approval limit $100.00) plus a small second household in EUR for the
household switcher:

| Persona     | Role in the Okafor family | Good for trying                                           |
| ----------- | ------------------------- | --------------------------------------------------------- |
| Maya Okafor | Owner                     | everything: members, allowances, reversal, reconciliation |
| Dev Okafor  | Approver                  | approving Sam's pending $180 request; reject with a note  |
| Sam Okafor  | Member                    | a request waiting for approval; overdraft on a small pot  |
| Ada Okafor  | Kid                       | the simplified UI: only her pot, spend, her own requests  |

### Against the real backend

```bash
# backend: docker compose up -d postgres; FIREBASE_PROJECT_ID=... ./mvnw -pl family-treasury -am spring-boot:run
cp apps/family-treasury/.env.example apps/family-treasury/.env.local   # set VITE_FIREBASE_* (or the emulator host)
pnpm --filter @platform/family-treasury dev
```

In dev the browser calls `/api/v1/...` and Vite proxies `/api` to `http://localhost:8088` (stripping `/api`). For a built
app served elsewhere set `VITE_API_BASE_URL` to the backend origin. Every API path starts with `/v1`, so the API client's
base is the service root: `/api` standalone, `<gateway>/api/family-treasury` in the workspace.

| Variable                                                          | Meaning                                                                                       |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `VITE_USE_MOCK`                                                   | `true` forces demo mode, `false` forces real mode. Unset: demo unless Firebase is configured. |
| `VITE_FIREBASE_AUTH_EMULATOR_HOST`                                | `host:port` of the Firebase Auth emulator (real mode).                                        |
| `VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID` | Firebase web config (real mode).                                                              |
| `VITE_API_BASE_URL`                                               | Backend origin, e.g. `http://localhost:8088`. Unset: use the dev proxy.                       |

Checks (from the monorepo root): `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @platform/family-treasury build`.

## As a workspace module

`src/module.tsx` exports `productModule` (id and gateway service `family-treasury`), which the workspace mounts under
`/app/family-treasury`. The same `TreasuryRoutes` and `ViewerProvider` run standalone and in the workspace; every link goes
through `ModuleLink` / `useModuleNavigate` / `useModulePath`, so the base path is the only difference.

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
- Real: everything else. With a backend configured the app uses only the shared `@platform/api-client`.

## Honest limitations

- **Not verified against the real service or Firebase.** No end-to-end run against the Spring service, Postgres or the
  Firebase emulator happened; the mock mirrors the Java source, so a drift between the two would only show up there.
  Nothing was checked in a real browser either: layout, responsiveness (375px) and dark mode rely on the shared tokens and
  components and have not been looked at. Tests run in jsdom.
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
- The production bundle is one ~650 kB chunk (Firebase is included even in demo mode).
