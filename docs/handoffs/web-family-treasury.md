# Handoff: family-treasury

## Candidates for `packages/ui` or other shared packages

- `src/lib/money.ts` (+ tests): parse, format and exact largest-remainder allocation. Any money-handling app needs it;
  a `@platform/money` package is the natural home.
- `useIdempotentMutation` / `useIdempotencyKey` (`src/api/hooks.ts`, `src/lib/idempotency.ts`): one Idempotency-Key per
  user intent, reused on retry and double click, rotated on success or key conflict. `@platform/api-client`'s
  `useApiMutation` cannot send custom headers, which is why this app uses `client.request` through its own hook.
  Suggest extending `useApiMutation` with a `headers(variables)` option and an `idempotent` mode.
- `src/components/QueryState.tsx`: loading skeleton, error with retry, or data. Every product app needs the same three
  states.
- `ErrorNotice`, `ConfirmDialog`, `StatCard`, `AmountField`, `MoneyText`, `AccessNotice`: small, token-only components.
  `ConfirmDialog` and an inline notice (`role="alert"` / `status`, variants danger/success/info) are the most reusable.
- `src/mock/mockBackend.ts` shows a route-table style HTTP mock (auth by token, problem+json, test hooks such as
  `dropNextResponses` and `breakRoute`). The gallery mock could adopt the same shape.
- Wishlist for `@platform/ui`: a numeric/currency input, a pagination control (Previous / Next / range text), a date
  input with min/max wiring, and an inline `Notice`. Today these are plain markup plus CSS in `src/styles.css`.

## Dependency notes

No new third-party dependencies. Versions are the workspace's existing pins (`react-router-dom` 7.18.6,
`@tanstack/react-query` 5.108.0, ...). The app depends on `@platform/ui`, `@platform/auth-web` and `@platform/api-client`
only.

## Assumptions

- The API base is `/api/v1` (dev proxy strips `/api`), or `${VITE_API_BASE_URL}/v1`. The service exposes `/v1/...`.
- Auth is the Firebase uid; household membership is keyed by it. In demo mode the bearer token is `demo:<uid>`.
- A pending approval is the only thing that needs a second person; deposits, transfers and splits never wait.
- Money fits in a JS safe integer (the service caps amounts at 999,999,999,999,999 minor units).
- `apps/family-treasury` is the only folder added; nothing outside it was edited.

## Process note

The working copy was lost once mid-run (scratch directory cleaned). It was re-created from the real `ui-common` and the
app files were replayed from the saved session transcript, then finished and re-verified.
