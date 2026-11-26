# 85 report: retire the standalone product app shells

Status: DONE_WITH_CONCERNS (concerns are three files outside this workstream's allowed scope that still point at the
retired apps; see "Not done").

Worked directly in the main checkout on `main` (per the coordinator), no branch, nothing pushed. One API usage-limit
stop happened mid-way; the work resumed from the committed state (five apps committed, tree clean).

## What changed

Every product package under `ui-common/apps/<product>` is now a module package only: no `App.tsx`, `main.tsx`,
`index.html`, `vite.config.ts`, `.env.example`, standalone layout, sign-in or runtime. `package.json` keeps its name,
dependencies (unchanged, so `pnpm-lock.yaml` and `--frozen-lockfile` are unaffected) and `exports`, and now has only a
`typecheck` script: the workspace bundles each module from source (`exports["./module"]` points at `src/module.tsx`),
so `pnpm -r build` builds the packages, gallery, site and workspace and skips the modules. `tsconfig.json` no longer
includes the deleted `vite.config.ts` (home-pulse adds `node` types for its test's `process.env.TZ`, which the Vite
config used to pull in).

Per app (what went, beyond the files above):

- **family-treasury**: StandaloneLayout, persona sign-in, `runtime.ts`, `runtimeContext.tsx`, the reconciliation
  page's standalone-only "Demo tools" (simulate drift; `useDemoParts` was always null in the workspace), shell CSS.
  `demoAuth.ts` moved to `src/test/` (tests still switch household members).
- **waiting-on**: sign-in, AppLayout, runtime, shell CSS.
- **consent**: sign-in, Shell (sidebar, pending badge, route focus), DemoTools (simulate request/read, tamper),
  runtime, shell CSS.
- **home-pulse**: shell/AppLayout and SignIn, `runtime.tsx` (its ingest-URL helpers, which the workspace already
  used, moved to `src/lib/ingest.ts`), shell CSS.
- **ask-your-life**: Shell, SignIn, runtime, `test/runtimeFor.ts`, shell CSS.
- **hub**: App, layout, session gate and sign-ins, runtime (+ context), launcher home, account and admin pages and
  hooks (the workspace has its own account page and the `@platform/admin-console` module), `config/apps.ts`,
  ThemeSelect, `hub.css`, the mock's auth-service routes (`mock/auth.ts`, only the shell called them), the
  OverviewPage `header`/`footer` props only the launcher used, the "Hub" page-title suffix. Kept: the whole Household
  `core` module (`@platform/hub/module`), its mock, `demoAuth.ts` moved to `src/test/`.
- **digital-legacy**: App, OwnerApp (sign-in, frame, key badge, the "Demo clock" DemoControls), runtime, shell CSS.

### Kept on purpose, and one thing moved into the workspace

- **The Digital Legacy trustee portal.** It existed only in the standalone app, yet invite links already point at the
  workspace (the service's `LEGACY_TRUSTEE_PORTAL_URL` defaults to `http://localhost:5190`, and Helm/Compose set it to
  the workspace URL), where `/trustee` did not exist. Deleting the shell would have removed the only way for a
  trustee to accept an invite, vote or combine shares. So `TrusteeApp.tsx` became `src/trustee.tsx`, exported as
  `@platform/digital-legacy/trustee` (`TrusteePortal({ apiBaseUrl, fetch?, now? })`; `TrusteeSessionProvider` now
  takes a `createClient(token)` instead of the standalone runtime). The workspace serves it at `/trustee/*`
  (`apps/workspace/src/pages/trustee/TrusteePortalPage.tsx`, routed in `App.tsx` before the auth gate): no workspace
  sign-in or session, its own API client with `Authorization: Trustee <token>` to `<gateway>/api/digital-legacy`, and
  in demo mode the Digital Legacy module's in-memory backend (so one tab can play owner and trustee). The gateway
  already passes `/v1/legacy/trustee/**` through without a platform token.
- `src/mock/` of every product (the workspace's `?demo=1` and all tests use them), `apps/gallery`, `apps/site`,
  `apps/workspace`, all packages, `home-pulse/e2e/manual-readings.mjs` (it drives the workspace).
- CSS classes that were already unused before this change were left alone unless they were obviously old shell chrome
  (a few `*-user`, `*-avatar`, `*-theme`, `*-hide-sm` rules were removed with the shell CSS).
- `hub/src/mock/state.ts` still has a `roles` set that only the removed auth routes read (harmless, tiny).

### Tests

Product behaviour that the standalone App exercised is still exercised: each app's render helper
(`test/renderApp.tsx`, `testing/harness.tsx`, `test/utils.tsx`, `test/setup.tsx`, `test/renderHub.tsx`,
`testing/render.tsx`) now mounts `productModule` the way the workspace does (workspace auth, session, API client,
query cache, theme, toasts, `RequireAuth` before mounting, a `<main>`, and a sidebar built from `productModule.nav`),
keeping the old helper signatures so the feature tests changed little. Tests that only tested the shell were deleted:
sign-in/sign-out screens, sidebar focus and badges, skip link, demo-mode detection, launcher, account, admin, hub
runtime, the `?empty=1` switch, standalone demo buttons. Converted rather than deleted: 401 handling now asserts the
session is signed out; not-found routes moved to `routes.test.tsx` files; the consent dashboard count and the hub
reminder lifecycle drive the mock directly instead of through demo buttons; Digital Legacy's key-badge assertions use
the vault page's own "Lock vault" button. New: `apps/workspace/src/trustee.test.tsx` (2 tests: `/trustee` opens
signed out, every request goes to `<API>/digital-legacy/v1/legacy/trustee/...` with `Trustee <token>` and none to
`/auth/v1/me`; in demo mode the portal answers from the mock and never calls the global fetch). Also fixed a race the
new harness exposed once under load (`consent/.../history.test.tsx` read the table while it still held placeholder
rows).

## Docs and dev

- `dev/web.sh`: no `all` option, no 5181-5187; it refuses names other than workspace, site, gallery.
- `dev/README.md`, root `README.md` (layout line, demo mode = `?demo=1`, trustee URL), `ui-common/README.md`,
  `ui-common/apps/README.md` (rewritten: how to add a product module), all seven product READMEs (run through the
  workspace, no env tables, test descriptions), `docs/TRACKER.md` item 10 marked done.
- `dev/qa/layout-check.mjs`: every product is a target on the one workspace server (`/app/<id>/...`, FIRST: links
  found from the module's own page), plus a `trustee-portal` target with no sign-in; default base 5190
  (`QA_BASE_WORKSPACE` overrides). `dev/qa/lib.mjs` lost the standalone "session" sign-in path.
- CI (`.github/`) and `deploy/` do not reference the standalone apps (the image builds `@platform/${APP}...` for
  workspace or site only); not touched. The site copy does not link to standalone apps.

## Results

- `pnpm lint`: clean (eslint, prettier, version check). `pnpm typecheck`: clean, every package.
- `pnpm test`: 194 files, 2200 tests, all passed (baseline before the change: 196 files, 2245 tests; the difference is
  the deleted shell tests minus the 2 new workspace tests). Under heavy parallel load (three suites at once) the
  existing home-pulse first-run flow test once hit its 5 s timeout; it passes in normal runs.
- `pnpm -r build`: green (packages, gallery, site, workspace).
- Live stack (gateway :8080, dev IdP :9100, workspace restarted via `dev/web.sh workspace`):
  - `node dev/qa/persona-walk.mjs`: every persona x every product route, **hard failures: 0** (admin route refused
    for developer and member, as expected).
  - Demo walk (scratch Playwright script, not committed): `?demo=1`, every module page renders its h1 with no page
    errors, `/trustee` renders, a bogus trustee token is refused by the demo mock, **0 requests left localhost:5190**.
  - Live trustee portal: `/trustee` renders without the workspace sign-in, and the token check goes to
    `http://localhost:8080/api/digital-legacy/v1/legacy/trustee/me` with `Authorization: Trustee <token>`, refused.
  - `node dev/qa/layout-check.mjs` with the new targets: exit 0; 144 page checks (workspace, admin console, all seven
    modules, the trustee portal; 390 and 1440 px; light and dark), every page fits at 390 px with 0 page errors
    (wide tables are listed as offenders inside their own scroll containers, as before).
- Not verified: a full live trustee flow (invite, accept, vote, combine) through the gateway in a browser; it is
  covered against the mock by the Digital Legacy tests. The deployed nginx image's SPA fallback for `/trustee/*` was
  not re-checked.

## Line counts removed (TS/TSX non-test incl. test helpers and vite config, CSS, test files)

| app             | TS/TSX before -> after | CSS before -> after | tests before -> after |
| --------------- | ---------------------- | ------------------- | --------------------- |
| waiting-on      | 4215 -> 3879 (-336)    | 784 -> 725 (-59)    | 1647 -> 1637 (-10)    |
| consent         | 5598 -> 5134 (-464)    | 983 -> 925 (-58)    | 2090 -> 2041 (-49)    |
| home-pulse      | 8179 -> 7783 (-396)    | 1074 -> 967 (-107)  | 3659 -> 3590 (-69)    |
| ask-your-life   | 4337 -> 4001 (-336)    | 1021 -> 956 (-65)   | 1689 -> 1653 (-36)    |
| digital-legacy  | 9091 -> 8763 (-328)    | 1037 -> 980 (-57)   | 3392 -> 3381 (-11)    |
| family-treasury | 8084 -> 7588 (-496)    | 608 -> 556 (-52)    | 2654 -> 2638 (-16)    |
| hub             | 7036 -> 5690 (-1346)   | 1026 -> 947 (-79)   | 2267 -> 1897 (-370)   |
| total           | -3702                  | -477                | -561                  |

`git diff --shortstat` over `ui-common/apps` for the whole workstream: 172 files, +1028 / -6189 (includes READMEs,
deleted `index.html`/env examples, and the workspace's new trustee page and test).

## Not done (outside this workstream's allowed files)

- `dev/e2e-waiting-consent-ask-ui.mjs` targets the retired standalone apps (5182, 5183, 5185) and `dev/web.sh all`;
  it will fail until pointed at `http://localhost:5190/app/<id>`.
- `dev/use-firebase.sh` still writes `.env.local` into every `ui-common/apps/*` folder (now only the workspace, site
  and gallery read one); harmless (gitignored) but stale. `dev/FIREBASE.md` says to open http://localhost:5181.
- `dev/audit/{legacy,household,treasury}.mjs` mention the standalone apps in their text (not checked further).
- `deploy/docker/web.Dockerfile` still accepts `VITE_TRUSTEE_PORTAL_URL`; it remains valid (optional override).
- `docs/adr/0002-workspace-modules.md` and `docs/handoffs/*` describe the standalone apps historically; left as is.

## Commits

4ed310a, 5d65646, 8847e82, 4ed3b28, 8066409, abfa1b3, ba826c6, fab72d3, f4fbec3, and this report's commit.
