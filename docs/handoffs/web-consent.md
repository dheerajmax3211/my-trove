# Handoff: consent app

## Candidates to promote to `packages/ui`

Built locally in `src/shared/components/` / feature folders because the kit lacks them:

- `ConfirmDialog` (Dialog with Cancel / destructive confirm, pending state and inline API error). Used for delete,
  revoke, deny, rotate and disable. Generic and the strongest candidate.
- `CopyButton` (clipboard with toast and fallback message).
- `LoadingBlock` (Spinner with an accessible label plus skeleton rows) and `ErrorState` (EmptyState + retry from an
  `ApiError`). Together they are the standard list "loading / error" pair; `ErrorState` depends on `@platform/api-client`
  so it fits better in a thin `ui-app` helper than in `@platform/ui`.
- `StatusBadge` / `SensitivityBadge` are product-specific; leave them in the app.
- A tree/disclosure list (`AttributeViews.tsx`, `TreeBranch`) could become a generic `TreeList` if a second app needs it.
- A `fieldset`/`legend` group style (`.fieldset` in `app.css`) and `.facts` (definition-list grid) are used repeatedly.
- `Card` accepts `role` / `aria-labelledby` but has no "article/group" affordance; cards here are `role="group"` named by
  their heading.

## Dependencies

- No new dependencies. Everything is pinned to versions already in the workspace (`@tanstack/react-query` is imported
  directly for `useQueryClient` and in the test helper, as the gallery does).
- `@platform/auth-web` statically imports Firebase, which makes the production chunk about 620 kB. Lazy-loading the
  Firebase client inside `createFirebaseAuthClient` would fix it for all apps (package change, not done here).

## Assumptions

- Dev proxy: browser calls `/api/v1/...`, Vite rewrites to `http://localhost:8084/v1/...`. `VITE_API_BASE_URL` defaults to
  `/api`. The gateway has no CORS config, so direct cross-origin calls are not supported.
- Owner identity is the Firebase token; nothing in the UI sends an owner id.
- Approving always sends `scopes`, `durationSeconds` and `maxSensitivity`; `maxReads` only when the owner enters one. The
  gateway defaults the ceiling to `SENSITIVE`, so the dialog preselects it and says what that withholds.
- Scopes typed in the register form accept a bare path (`profile.sizes`) and get `:read` appended before sending.
- Query keys are the GET paths (`apiQueryKey`), so mutations invalidate by path prefix (see `shared/api/paths.ts`).
- The audit "verify" is a query with `enabled: false` on the Audit screen (runs on click) and `enabled: true` on the
  dashboard, sharing one cache entry.
- The demo-mode "Demo controls" exist only because third-party apps are not part of this UI; remove with the mock when the
  gateway is always available.
