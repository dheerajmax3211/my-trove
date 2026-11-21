# Handoff: waiting-on

## Candidates for `packages/ui` or shared packages

- **CopyButton + `useCopyToClipboard`** (`src/components/CopyButton.tsx`, `src/lib/copy.tsx`): copy with a toast and a
  label swap. Any product that shows an address, code or link needs it.
- **ErrorState** (`src/components/ErrorState.tsx`): EmptyState with `role="alert"`, readable ApiError text and Try again.
  Every list and detail screen in the other apps needs the same.
- **`describeError` / `serverFieldErrors`** (`src/lib/errors.ts`): ApiError to plain sentence, and field errors from a
  problem document (`errors` as a map or a list). Fits `@platform/api-client`.
- **Sign-in screen** (`src/auth/SignIn.tsx`): near copy of the gallery demo's; should live in `@platform/auth-web` or ui.
- **Clock provider** (`src/lib/clock.tsx`): injectable "now" for date-dependent screens and deterministic tests.
- **Focus heading on navigation** (`useFocusHeadingOnNavigate` in `src/layout/AppLayout.tsx`): the shell could do it.
- **Timeline** (`features/items/components/Timeline.tsx`): generic accessible newest-first event list.
- **Card-style list rows** were used instead of `DataTable`, which does not collapse well at 375px.
- **problem+json mock helpers**: every app's mock API will rebuild `problem()`/latency/401 handling.

## Dependencies

None added beyond the gallery's set (`react-router-dom`, `@tanstack/react-query` at the same exact versions).
`@platform/tokens` is not a direct dependency (not needed; `@platform/ui/styles.css` brings the tokens).
The build warns about a 600 kB chunk (Firebase). Lazy-loading the real runtime, as the gallery does for its demo,
would fix it; I kept it simple.

## Assumptions

- Routing uses browser history with base `/`; the host must fall back to `index.html`. The Vite dev proxy rewrites
  `/api/x` to `/x` because the service serves `/v1/**` without a prefix.
- Demo mode = no Firebase config or `VITE_USE_MOCK=true`; in demo mode the stub user is signed in at start.
- `amount` is sent as a JSON number (the service uses BigDecimal with 2 decimals; the form allows at most 2).
- The default plan is ported from `EscalationPlan.defaultFor` to explain the schedule before creating; if the service
  defaults change, `logic/schedule.ts` must change too (the service ignores the preview and computes its own).
- Dates: `expectedBy` is a calendar date handled in local time; instants are shown in local time with the browser's
  language.
- Closed items still allow letter previews (the service permits it).
- Backend field errors are not sent today; the client reads an `errors` extension if one appears.
