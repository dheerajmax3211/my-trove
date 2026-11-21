# Consent (`@platform/consent`)

The owner dashboard for the **consent gateway** ("me as an API"). You keep a vault of personal attributes and decide
which third-party apps may read which attributes, for what purpose and for how long. Apps ask; you approve (narrowing
only), watch what they read and revoke at will. Every access lands in a tamper-evident audit chain that this app can
verify.

Only the Firebase-authenticated **owner API** (`/v1/owner/**`) is used. The OAuth and gateway endpoints are for the
third-party apps and are not part of this UI.

## Screen map

```
/            Overview       pending-request count, who has access now (active grants), recent activity, audit-chain health
/requests    Requests       Pending (approve with narrowing / deny with confirmation) and Past requests
/grants      Grants         Active and All (incl. revoked/expired): scopes, purpose, expiry, reads used/max; revoke with confirmation
/vault       Vault          attributes as a tree or table by dotted key path; add / edit / delete; validated JSON editor; sensitivity badges
/clients     Apps           register (id + secret shown once), rotate secret, disable (revokes everything), link to an app's activity
/history     Access history paged, newest first, filter by app (cursor paging with beforeSeq)
/audit       Audit          "Verify chain": OK, or the first broken link in plain language
```

Approving a request opens a dialog where you can untick scopes, shorten the duration, cap the reads and set the
highest sensitivity level the app may see. A live "`<app>` will be able to read:" summary lists the actual attributes of
your vault that the choice exposes (and the ones withheld because of the sensitivity ceiling). Widening is blocked in
the UI and by the API.

## Run it

```
pnpm install
pnpm --filter @platform/consent dev        # http://localhost:5183
```

### Demo mode (default, zero setup)

With no Firebase config (or `VITE_USE_MOCK=true`) the app uses a stub sign-in ("Continue as the demo user") and an
in-memory mock gateway seeded with a believable vault, three apps, two pending requests, one grant with read history and
a denied request. Everything is in memory: a reload resets it.

Apps talk to the gateway, not to this UI, so the sidebar has **Demo controls** that play the app's part: _Simulate an
access request_, _Simulate a data read_ and _Tamper with the audit log_ (so you can see the broken-chain state).

### Against the real gateway

1. Run `consent-gateway` on `:8084` (see its README; needs Postgres and `FIREBASE_PROJECT_ID`).
2. Copy `.env.example` to `.env.local` and set the Firebase values (or `VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`).
3. `pnpm --filter @platform/consent dev`. The browser calls `/api/v1/owner/...`; the Vite dev proxy strips `/api` and
   forwards to `http://localhost:8084`.

| Variable                                                          | Meaning                                                                          |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `VITE_USE_MOCK`                                                   | `true` forces demo mode even if Firebase is configured                           |
| `VITE_FIREBASE_API_KEY`, `_PROJECT_ID`, `_AUTH_DOMAIN`, `_APP_ID` | Firebase web config; enables real mode                                           |
| `VITE_FIREBASE_AUTH_EMULATOR_HOST`                                | `host:port` of the Auth emulator; enables real mode (demo key/project filled in) |
| `VITE_API_BASE_URL`                                               | Gateway base URL. Default `/api` (dev proxy). See the CORS note below            |

## Layout

```
src/
  runtime.ts            picks demo vs real: auth client + api client + query client
  App.tsx, layout/      providers, shell, nav (pending badge), demo controls, route focus
  auth/                 sign-in page
  shared/               api types + paths, lib (errors, scopes, json, format, audit wording), common components
  features/<feature>/   api (types/pure logic), hooks (useApiQuery/useApiMutation), components, pages  (+ *.test.tsx)
  mock/                 in-memory gateway: backend.ts (routes), chain.ts (hash-chained audit log), http.ts (problem+json)
  test/utils.tsx        renderApp(): whole app against the mock, no latency, no retries
```

## What is mocked and what is real

- **Real**: all UI, the typed API layer and every request path, body and query the app sends (taken from the gateway's
  controllers), problem+json error handling, field-level validation errors, 401 refresh-and-retry (shared client).
- **Mocked in demo mode and in tests**: the gateway. The mock mirrors the gateway's contract: same paths and status
  codes (201/204/400/401/404/409), `ProblemDetail` + `code` + `errors` shapes, `ATTRIBUTE_EXISTS`,
  `REQUEST_ALREADY_DECIDED`, `REQUEST_EXPIRED` (7 days), `CLIENT_DISABLED`, narrowing-only approval rules, the `SENSITIVE`
  default ceiling, disabling a client revokes its grants, audit entries for every write, and the same chain verification
  (`ENTRY_HASH_MISMATCH`, `SEQUENCE_GAP`, `HEAD_MISMATCH`).
- The mock chain hash is a salted FNV-1a, **not SHA-256**. It detects edits, deletions and truncation the same way but is
  not cryptographic.
- The mock "shown once" behaviour is contract-faithful (secrets are never returned by list/detail endpoints), but the
  mock keeps the plaintext in memory so tests can compare it with what the dialog showed.

## Secrets

The client secret exists only in the page state that feeds the one-time dialog. The mutation hooks use `gcTime: 0` and
are `reset()` right after success, so it is not kept in the query library's cache either; it is never written to
storage or logged. Closing the dialog (or reloading) loses it for good; the answer to a lost secret is "rotate".

## Tests

`pnpm test` (repo root) runs everything; the app's own tests (`apps/consent/src/**`) cover:

- end-to-end flows through the UI against the mock: vault CRUD with invalid JSON / null / bad key paths / duplicates;
  request -> narrow scopes + duration + reads -> approve -> grant appears narrowed; widening blocked; sensitivity
  withholding; deny with note and confirmation; already-decided conflict; expired requests; revoke (and the refusal on
  the next read); client registration with the secret shown once and gone after closing and after a reload; rotate;
  disable (grants revoked); audit verify OK and each broken state; dashboard; history paging and filtering; sign-in,
  sign-out, focus on route change, 401 -> sign-in; every list's error + retry and empty state;
- the API layer against the mock contract (request shapes, query encoding, error mapping, validation field errors);
- pure logic: scope matching, JSON rules, durations, approval validation and visibility, tree building, audit wording.

## Honest limitations

- **Not verified against the real gateway or real Firebase.** The contract comes from reading the Java controllers and
  the mock was written to match; a live end-to-end run was not done.
- **Not looked at in a browser.** Layout (375px), dark mode and contrast follow the design tokens and AppShell but were
  not visually checked here; only DOM behaviour is covered by tests.
- The gateway has no CORS configuration, so an absolute `VITE_API_BASE_URL` only works behind a same-origin proxy.
- Disabling a client is permanent (the gateway has no re-enable endpoint). `redirectUri` is not exposed (stored but
  unused by the gateway). The approval dialog cannot change the allowed-hours window (it is shown on the request).
- "Past requests" shows what the gateway returns (latest 200). History paging asks for one extra row to know whether an
  older page exists; there is no total count.
- Pending requests that outlived the 7-day TTL are shown under Past requests as Expired and cannot be approved.
- The production bundle is about 620 kB (Firebase Auth is statically imported by `@platform/auth-web`).
