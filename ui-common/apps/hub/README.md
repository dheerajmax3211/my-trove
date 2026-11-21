# @platform/hub

The platform's front door: the signed-in home of the personal platform. It owns the cross-product
features (households, reminders, files, activity, account, admin) and launches the product apps.

Vite + React 19 + TypeScript, built only from `@platform/ui`, `@platform/auth-web` and `@platform/api-client`.

## Screens

```
/                      Home: greeting, your roles, launcher cards for the six product apps,
                       upcoming reminders, recent personal activity
/households            List, create, join with an invite code
/households/:id        Members (role change, remove), invites (create, copy, revoke, owners only),
                       leave, delete (type the name to confirm), link to the household's activity
/reminders             Personal or household; filter by scope and status; create, edit, cancel;
                       recurrence DAILY / WEEKLY / MONTHLY with an interval; status badges
/files                 Upload (to you or a household), list, signed download link (1 min to 1 h),
                       download, delete
/activity              Paged audit events (20 per page) for you or a chosen household, filter by kind
/account               Profile from auth-service, roles, user ID, theme, sign out, demo tools
/admin                 Administrators only: look a user up by ID, grant or revoke roles
```

Every screen has loading, empty and error states (with retry). Forms validate on the client and
destructive actions go through a confirmation dialog. `/admin` is hidden from the navigation for
non-admins and the route itself shows "Administrators only" (the server also answers 403).

## Run it

Demo mode needs nothing but this app:

```bash
pnpm install
pnpm --filter @platform/hub dev      # http://localhost:5181
```

With no Firebase config the hub starts in **demo mode**: you pick a demo user (Alice is an admin and
owns a household, Bob is a member, Carol is in nothing yet) and all data lives in memory in the tab.
Use the "Demo user" switcher in the top bar to play both sides of an invite. The Account page has
demo tools to move the mock clock forward so reminders fire.

Against the real backend:

```bash
# terminals: auth (:8081) and shared-service (:8082) running, FIREBASE_PROJECT_ID set
cp apps/hub/.env.example apps/hub/.env.local     # fill in VITE_FIREBASE_*
pnpm --filter @platform/hub dev
```

The Vite dev server proxies `/api/auth/*` to `http://localhost:8081/*` and `/api/shared/*` to
`http://localhost:8082/*`, so the browser only ever talks to one origin.

## Configuration (Vite env)

| Variable                                                                                                      | Meaning                                                                                                           |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `VITE_USE_MOCK=true`                                                                                          | Force demo mode even when Firebase is configured                                                                  |
| `VITE_API_BASE_URL`                                                                                           | API gateway root, default `/api`. Requests go to `<base>/auth/v1/...` and `<base>/shared/v1/...`                  |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_*`                                        | Firebase web config. Presence of key and project id switches to live mode                                         |
| `VITE_FIREBASE_AUTH_EMULATOR_HOST` (alias `VITE_AUTH_EMULATOR_HOST`)                                          | Use the Firebase Auth emulator                                                                                    |
| `VITE_APP_URL_WAITING_ON`, `_CONSENT`, `_HOME_PULSE`, `_ASK_YOUR_LIFE`, `_DIGITAL_LEGACY`, `_FAMILY_TREASURY` | Launcher card targets. Defaults `http://localhost:5182` to `5187` in that order. Only `http(s)` URLs are accepted |

## Structure

```
src/
  App.tsx, main.tsx       providers, routes; a fresh query cache per signed-in user
  api/paths.ts            every backend path, in one place
  runtime/                demo-vs-live wiring, demo auth client (switchable users)
  mock/                   in-memory auth-service and shared-service (see below)
  layout/                 shell, route guards
  components/             small shared pieces (ConfirmDialog, ErrorState, Pager, ...)
  features/<feature>/     types, hooks (api), rules/validation, components, pages
```

## What is mocked and what is real

Demo mode replaces only the network and Firebase. `src/mock` implements the same endpoints the UI
uses, with the real status codes, problem+json bodies (shared-service) and Spring Boot error bodies
without messages (auth-service), the same validation limits (title 300, name 200, interval 1 to 365,
invite lifetime 1 to 720 hours, link lifetime 1 to 3600 seconds, 10 MB uploads), single-use expiring
invites, the last-owner rules, 404 for non-members versus 403 for members without the role, a port of
the recurrence algorithm, a scheduler that fires due reminders, signed expiring download tokens, and the
admin guardrails. It was written from the controllers and services in the backend repo, not from a
running server.

Real: the UI, the API client, request shapes and error mapping. Not real in demo mode: Firebase, Postgres,
the file blob store, notification delivery.

## Tests

`pnpm test` from the repo root runs them (Vitest, Testing Library, user-event, no sleeps). They drive the
real app against the mock backend: sign-in and session call, launcher links, household create / invite /
accept as another user / role change / remove / leave / delete and every last-owner rule, reminder
create / validate / edit / cancel / firing and recurrence, file upload / signed link / download / expiry /
delete, audit paging and scoping, admin gating and guardrails, cache isolation between users, and
retry after failed loads. Separate tests pin the mock to the backend contract, plus pure logic.

## Honest limitations

- **No "complete" action.** shared-service has no endpoint to mark a reminder done: reminders become
  COMPLETED when the scheduler fires a one-off. The UI offers Cancel (which is what the API has) and explains
  the lifecycle. Repeating reminders keep going until cancelled.
- **People are shown by Firebase uid.** Household members, invite creators and audit actors come back as uids
  only. The signed-in user is labelled "You"; others are not resolved to names.
- **Admin lookup is by user ID only.** auth-service has no search or list endpoint, so an admin needs the ID
  (users can copy theirs from Account). The role list (USER, ADMIN) is hard-coded because no endpoint lists roles,
  and auth-service errors carry no message, so guardrail messages come from the UI, not the server.
- **Not built:** the notification inbox (`GET /v1/notifications`) and the membership check endpoint. Home
  shows only the caller's personal audit events, not every household's.
- Recurrence is computed in UTC by the backend; the date picker is local time.
- Live mode (real Firebase and real services) was never run: only the code path and configuration are
  covered by tests and type checks.
- The production bundle is about 615 kB because Firebase is included; it is not code-split.
- Layout and dark mode were built with tokens and checked structurally, not looked at in a browser.
