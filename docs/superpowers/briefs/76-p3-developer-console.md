# Phase 3 / P3: developer console and members' connected apps (frontend)
Backend already exists and is live (merged on main, see `platform-service/README.md`, `dev/e2e-developer.sh`):
- Apps: `/api/platform/v1/developer/apps` (create, list, get, update, rotate secret, revoke secret, delete). Client secret shown once.
- API keys: under the developer apps, create/list/revoke; plan limits FREE 3, PRO 10, DEVELOPER 50; key shown once; scopes from a catalogue (currently `usage:read`).
- Webhooks: endpoints (create, list, update, delete, rotate secret), subscribed event types, delivery log, replay. Signing secret shown once.
- API docs index: `/api/platform/v1/docs` (per-service OpenAPI; only platform publishes one today; say so).
- Consent grants (members' connected apps): the consent gateway's owner endpoints (`/api/consent/v1/owner/grants`, revoke).
Scope: `ui-common/apps/workspace/src/developer/**` (replace the current placeholder area), `ui-common/apps/workspace/src/demo/**` (demo API for these endpoints, same contract), the Developer nav entry, and a "Connected apps" section on the Account page for members (consent grants). Do not change the backend.
Build, as a bento-style developer console matching the workspace design (`docs/design/brand.md` v3, the gallery dashboard):
1. Overview: your usage (plan meter from `/api/platform/v1/usage/me`), keys and apps counts against plan limits, the latest deliveries with status.
2. Apps: list as cards; create form (name, redirect URIs with validation: https, or http on localhost); app detail with keys, secret actions; one-time secret reveal dialog with copy and an honest "shown once" warning.
3. Keys: create with scope picker and optional expiry; one-time reveal; revoke with confirmation; show last used and limit usage.
4. Webhooks: endpoints list; create with URL (https or localhost), event type checkboxes (from the catalogue the backend exposes), secret reveal once; delivery log with status, attempts, next retry; replay button.
5. API docs: links to the aggregated index and a first-request snippet (curl with a key placeholder). Honest about what is published.
6. Playground (small): choose a key, method and a path under an allowed scope, send through the gateway, show status and body. Refuse out-of-scope paths client-side with the server's message.
7. Members: Account page gets "Connected apps": consent grants with app name, scope, expiry, and Revoke (uses the existing owner endpoints).
8. Permissions: the Developer area is visible only to holders of `apps:manage`; members see Connected apps only. Forbidden screens say what is missing.
9. Demo mode: the same screens work with the demo API (no network calls), labelled as demo.
Verify live: sign in as developer@example.test on the dev stack (the chooser), create an app and a key, use the key in the playground, create a webhook to a local receiver, check the delivery. Member sees Connected apps and can revoke a grant. Screenshots at 390 and 1440, light and dark; read every screenshot; fix what is weak.
Test continuously: Vitest for each screen and the demo API, Playwright live runs (your own browser, not the shared MCP). Commit on `p3/developer-console`. Do not push.
