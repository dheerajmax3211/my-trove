# 85: Retire the standalone product app shells

Read `80-common.md` first. Report: `docs/superpowers/briefs/85-report.md`.

Each product under `ui-common/apps/<product>` is two things: a module the workspace mounts (`src/module.tsx` and what it
imports: features, routes, mock API for demo mode, today items) and a standalone single-page app with its own shell
(`src/App.tsx`, `src/main.tsx`, `index.html`, `src/layout/`, `src/auth/` or own sign-in, standalone runtime wiring, its
own Vite dev server on ports 5181-5187, its own `.env` files). The workspace (`apps/workspace`, port 5190) replaces all
the standalone shells. The owner approved retiring them to remove duplicate code.

Keep: every product's module and everything it uses, including `src/mock/` (the workspace's `?demo=1` mode uses each
module's mock API), the `hub` package's Household "core" module (the workspace imports `@platform/hub/module`),
`apps/gallery` (the design-system showcase, a separate dev tool), `apps/site`, `apps/workspace`, all packages.

Do:
1. For each product app (waiting-on, consent, home-pulse, ask-your-life, digital-legacy, family-treasury, hub): delete
   the standalone shell and anything only it uses (find usage with the TypeScript compiler and grep, not guesswork).
   Move any test that exercises module behaviour through the standalone App into a module-level test so coverage of
   product behaviour is not lost; delete tests that only test the shell. The package keeps building what the workspace
   imports (check each package.json `exports`, build and typecheck scripts; turn the app into a library-style package if
   needed, the way `packages/*` are built). Rename nothing (`@platform/<product>` stays).
2. Remove the standalone dev servers from `dev/web.sh` (the `all` option and ports 5181-5187), from `dev/README.md`,
   the root `README.md` layout and quick start, `ui-common/README.md`, `ui-common/apps/README.md`, Vite/env examples,
   CI if referenced, and the site copy if it links to standalone apps. Check `dev/qa/layout-check.mjs` targets.
3. Prove nothing product-facing regressed: `pnpm lint && pnpm typecheck && pnpm test && pnpm -r build` all green;
   the workspace still mounts every product, live and in `?demo=1`. If the dev stack is up (gateway :8080, workspace
   :5190 via `dev/web.sh workspace`), run `node dev/qa/persona-walk.mjs` (Playwright: set PLAYWRIGHT_CORE to
   `$HOME/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core/index.mjs` if needed) and report the result.
4. Report the line counts removed (TS/TSX, CSS, tests) per app, and anything you kept on purpose with the reason.
