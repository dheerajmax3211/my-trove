# Consent (`@platform/consent`)

The owner dashboard for the **consent gateway** ("me as an API"). You keep a vault of personal attributes and decide
which third-party apps may read which attributes, for what purpose and for how long. Apps ask; you approve (narrowing
only), watch what they read and revoke at will. Every access lands in a tamper-evident audit chain that this app can
verify.

Only the Firebase-authenticated **owner API** (`/v1/owner/**`) is used. The OAuth and gateway endpoints are for the
third-party apps and are not part of this UI. The workspace mounts this module at `/app/consent`.

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

This package has no app or dev server of its own: the workspace mounts it at `/app/consent`.

```
dev/web.sh workspace     # http://localhost:5190/app/consent; add ?demo=1 for the in-memory mock (no backend)
```

Live mode needs the dev stack (`dev/up.sh`, gateway on :8080): the workspace's API client calls
`<gateway>/api/consent/v1/...`. Sign-in and `VITE_*` configuration belong to the workspace (`apps/workspace`).
The workspace's demo mode uses an in-memory mock gateway seeded with a believable vault, three apps, two pending
requests, one grant with read history and a denied request; a reload resets it. (The standalone app's "Demo controls",
which played a third-party app's part, were retired with it; the mock still has `simulateAccessRequest`,
`simulateRead` and `tamperAudit` for tests.)
Checks, from `ui-common`: `pnpm lint && pnpm typecheck && pnpm test`; the module is bundled by
`pnpm --filter @platform/workspace build`.

## Layout

```
src/
  module.tsx, routes.tsx, demo.ts, today.ts   the workspace module, its pages, demo fetch, Today feed
  shared/               api types + paths, lib (errors, scopes, json, format, audit wording), common components
  features/<feature>/   api (types/pure logic), hooks (useApiQuery/useApiMutation), components, pages  (+ *.test.tsx)
  mock/                 in-memory gateway: backend.ts (routes), chain.ts (hash-chained audit log), http.ts (problem+json)
  test/utils.tsx        renderApp(): mounts the module as the workspace does, against the mock, no latency, no retries
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
  disable (grants revoked); audit verify OK and each broken state; dashboard; history paging and filtering; not-found;
  repeated 401 signs the session out; every list's error + retry and empty state;
- the API layer against the mock contract (request shapes, query encoding, error mapping, validation field errors);
- pure logic: scope matching, JSON rules, durations, approval validation and visibility, tree building, audit wording.

## Honest limitations

- **Not verified against the real gateway or real Firebase.** The contract comes from reading the Java controllers and
  the mock was written to match; a live end-to-end run was not done.
- **Not looked at in a browser by these tests.** Layout (375px), dark mode and contrast follow the design tokens; the
  unit tests cover DOM behaviour only (the workspace's `dev/qa/` scripts check layout in a real browser).
- Disabling a client is permanent (the gateway has no re-enable endpoint). `redirectUri` is not exposed (stored but
  unused by the gateway). The approval dialog cannot change the allowed-hours window (it is shown on the request).
- "Past requests" shows what the gateway returns (latest 200). History paging asks for one extra row to know whether an
  older page exists; there is no total count.
- Pending requests that outlived the 7-day TTL are shown under Past requests as Expired and cannot be approved.
- The production bundle is about 620 kB (Firebase Auth is statically imported by `@platform/auth-web`).
