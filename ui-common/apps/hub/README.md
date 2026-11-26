# @platform/hub

The Household module (`core`) of the workspace: households, reminders, files and activity, shared with the people
you choose. The workspace mounts it at `/app/core` (sidebar title "Household"), and its API client is bound to the
shared service (`<gateway>/api/shared`, paths start at `/v1`). The package keeps its historical name; its standalone
"hub" app (launcher, account and admin pages, its own sign-in) was retired on 2026-11-26: the workspace has its own
home, account page and admin console.

## Screens (module-relative)

```
/                      Overview: who you share with, what is shared, the one thing to do next
/households            List, create, join with an invite code
/households/:id        Members (role change, remove), invites (create, copy, revoke, owners only),
                       leave, delete (type the name to confirm), link to the household's activity
/reminders             Personal or household; filter by scope and status; create, edit, cancel;
                       recurrence DAILY / WEEKLY / MONTHLY with an interval; status badges
/files                 Upload (to you or a household), list, signed download link (1 min to 1 h),
                       download, delete
/activity              Paged audit events (20 per page) for you or a chosen household, filter by kind
```

Every screen has loading, empty and error states (with retry). Forms validate on the client and
destructive actions go through a confirmation dialog.

## Run it

This package has no app or dev server of its own.

```
dev/web.sh workspace     # http://localhost:5190/app/core; add ?demo=1 for the in-memory mock (no backend)
```

Live mode needs the dev stack (`dev/up.sh`, gateway on :8080, shared-service running). Sign-in and `VITE_*`
configuration belong to the workspace (`apps/workspace`). In demo mode `createDemoFetch` serves an in-memory
shared-service seeded with a household for the demo user, and file downloads are served from it too
(`core/demoTransport.ts`), so nothing reaches the network.

Checks, from `ui-common`: `pnpm lint && pnpm typecheck && pnpm test`; the module is bundled by
`pnpm --filter @platform/workspace build`.

## Structure

```
src/
  module.tsx              productModule (id `core`, service `shared`)
  core/                   CoreRoutes, CoreProviders/useCoreEnv (clock, downloads, names), Today feed, demo fetch
  api/paths.ts            every backend path, in one place
  mock/                   in-memory shared-service (see below)
  components/             small shared pieces (ConfirmDialog, ErrorState, Pager, ...)
  features/<feature>/     types, hooks (api), rules/validation, components, pages
  test/                   renderHub (the module as the workspace mounts it, switchable demo users) and renderModule
```

## What is mocked and what is real

Demo mode and the tests replace only the network. `src/mock` implements the shared-service endpoints the UI
uses, with the real status codes, problem+json bodies, the same validation limits (title 300, name 200, interval 1 to 365,
invite lifetime 1 to 720 hours, link lifetime 1 to 3600 seconds, 10 MB uploads), single-use expiring
invites, the last-owner rules, 404 for non-members versus 403 for members without the role, a port of
the recurrence algorithm, a scheduler that fires due reminders and signed expiring download tokens. It was written from the controllers and services in the backend repo, not from a
running server.

Real: the UI, request shapes and error mapping. Not real in demo mode: sign-in, Postgres,
the file blob store, notification delivery.

## Tests

`pnpm test` from the repo root runs them (Vitest, Testing Library, user-event, no sleeps). They mount the
module as the workspace does against the mock backend: household create / invite / accept as another user /
role change / remove / leave / delete and every last-owner rule, reminder create / validate / edit / cancel /
firing and recurrence, file upload / signed link / download / expiry / delete, audit paging and scoping, the
module mounted under its base, the Today feed, and retry after failed loads. Separate tests pin the mock to the backend contract, plus pure logic.

## Honest limitations

- **No "complete" action.** shared-service has no endpoint to mark a reminder done: reminders become
  COMPLETED when the scheduler fires a one-off. The UI offers Cancel (which is what the API has) and explains
  the lifecycle. Repeating reminders keep going until cancelled.
- **People are shown by Firebase uid.** Household members, invite creators and audit actors come back as uids
  only. The signed-in user is labelled "You"; others are not resolved to names (demo mode names its cast).
- **Not built:** the notification inbox (`GET /v1/notifications`) and the membership check endpoint.
- Recurrence is computed in UTC by the backend; the date picker is local time.
- Layout and dark mode were built with tokens and are checked structurally by these tests; the workspace's
  `dev/qa/` scripts look at them in a real browser.
