# Hub handoff

## Candidates to promote into `packages/ui` or `packages/auth-web`

| Candidate                                                                                   | Where                                                | Notes                                                                                                                                                              |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ConfirmDialog` (confirm / cancel labels, pending, inline error, typed-phrase confirmation) | `src/components/ConfirmDialog.tsx`                   | Every product app needs destructive confirmations. Built on `Dialog`.                                                                                              |
| `ErrorState` (ApiError to heading, message and retry)                                       | `src/components/ErrorState.tsx`, `src/lib/errors.ts` | The message mapping (network, 401, 403, 404, 5xx, Spring's nameless validation 400) is app-independent. Could live next to `ApiError`.                             |
| `CopyButton`, `Pager`, `ThemeSelect`, `MemberLabel`                                         | `src/components/`                                    | `ThemeSelect` is a copy of the gallery's. `Pager` is zero-based "Showing a to b of n" with Previous / Next.                                                        |
| Switchable multi-user demo auth client                                                      | `src/runtime/demoAuth.ts`                            | `createStubAuthClient` signs in one fixed user. Several apps need "switch to another user" for flows like invites. Could become an option of the stub client.      |
| Per-user query cache                                                                        | `src/App.tsx` (`SignedInTree` keyed by uid)          | `ApiProvider` created inside `RequireAuth` and remounted per uid, so switching user never shows another user's cached data. Worth documenting in `apps/README.md`. |

## Dependency notes

- No new third-party packages. `@tanstack/react-query` is a direct dependency at the workspace's pinned `5.108.0`
  (used for the one custom `useQuery` in `SessionGate` and for cache updates).
- The API client has no binary response support (`parseSuccess` reads text). File downloads therefore
  bypass it: the signed link is fetched directly (demo) or navigated to (live). A `responseType: 'blob'` option
  would let apps download through the client.
- `useApiMutation` always sends the variables as the body unless a `body` function is given; no-body POST / PUT
  calls use `body: () => undefined`. A `body: false` option would be clearer.
- `@platform/auth-web` reads `VITE_FIREBASE_AUTH_EMULATOR_HOST`; the brief also names `VITE_AUTH_EMULATOR_HOST`.
  The hub accepts both by aliasing in `runtime.ts`.

## Assumptions

- The gateway layout is `<VITE_API_BASE_URL>/auth/...` and `<VITE_API_BASE_URL>/shared/...`, mirroring the
  Vite proxy. A production gateway must strip the service segment the same way.
- Routing is `BrowserRouter` with base `/`; the host must serve `index.html` for unknown paths.
- Download links from shared-service are relative (`/v1/files/download?token=...`); the hub prefixes
  `<base>/shared`.
- Product launch URLs default to `localhost:5182` to `5187` in the order waiting-on, consent, home-pulse,
  ask-your-life, digital-legacy, family-treasury.
- The mock backend was derived from the backend source, not from a running instance; if a controller changes,
  `src/mock` and `src/mock/backend.test.ts` need the same change.
