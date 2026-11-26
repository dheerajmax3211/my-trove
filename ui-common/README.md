# platform-frontend (`ui-common`)

The single frontend monorepo for the personal platform. The web apps and the product modules live in `apps/`;
everything they share (design tokens, UI components, auth, API client, the workspace-module contract) lives in
`packages/`. Every product runs inside the workspace (`apps/workspace`); there are no standalone product apps.

```
ui-common/
├── packages/
│   ├── tokens/       @platform/tokens     design tokens: typed TS + generated CSS variables
│   ├── ui/           @platform/ui         React 19 components (Radix primitives + CSS Modules)
│   ├── auth-web/     @platform/auth-web   Firebase Auth wrapper: provider, hooks, route guard
│   └── api-client/   @platform/api-client typed fetch + TanStack Query helpers
└── apps/
    ├── workspace/    @platform/workspace  the signed-in app: every product as a module (:5190)
    ├── site/         @platform/site       the public site (:5191)
    ├── gallery/      @platform/gallery    living docs + signed-in demo shell
    ├── <product>/    @platform/<product>  seven product modules the workspace mounts (no dev server of their own)
    └── README.md     how to add a product module (e.g. apps/waiting-on)
```

## Quick start

Requires Node 22.12+ (developed on 24) and pnpm 11 (`corepack enable` picks it up from `packageManager`).

```bash
pnpm install
pnpm dev          # gallery at http://localhost:5173 (hot-reloads packages from source)
pnpm lint         # eslint (flat config, type-aware + jsx-a11y + react-hooks) + prettier + version policy
pnpm typecheck    # tsc --noEmit in every package/app
pnpm test         # vitest run: one run covers every package and the gallery
pnpm build        # builds each package to dist/ (ESM + .d.ts), then the gallery against those dists
```

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` must all pass from a clean checkout; it is the
definition of green.

The gallery works with **zero setup**: with no env vars it uses an in-memory stub auth client and mock API.
To try real auth, copy `apps/gallery/.env.example` to `.env.local` and set
`VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` (Firebase Auth emulator) or the `VITE_FIREBASE_*` values.

## Architecture

```
            ┌───────────── apps/* (workspace, site, gallery; product modules mounted by the workspace) ──────────┐
            │                                                                                                  │
   @platform/ui ───────────┐   @platform/auth-web ──────────────┐   @platform/api-client ───────────────┐    │
   components + base CSS   │   AuthProvider, useAuth, RequireAuth│   createApiClient, ApiError, hooks    │    │
            │              │            │ getIdToken(force)      │            ▲ getToken(forceRefresh)   │    │
            ▼              │            └────────────────────────┼────────────┘                          │    │
   @platform/tokens ◄──────┘     (apps wire the two together:  getToken: (f) => auth.getIdToken(f))       │    │
   TS tokens + tokens.css                                                                                 │    │
```

Design decisions worth knowing:

- **Packages are decoupled through functions, not imports.** `api-client` does not depend on `auth-web`; it
  takes `getToken(forceRefresh)`. `auth-web` exposes an `AuthClient` interface (Firebase, stub, or anything
  else), so apps and tests can swap implementations.
- **Source in dev, `dist` in CI.** Each package exports a custom `@platform/source` condition that points at
  `src/`. TypeScript (`customConditions`), Vitest and `vite dev` use it, so there is no build step in the inner
  loop and `typecheck`/`test` work on a fresh clone. `vite build` of the gallery resolves the real `dist`
  outputs instead, so `pnpm build` proves the published artifacts are importable.
- **Tokens are data first.** `@platform/tokens` is plain JSON-ish TypeScript; CSS variables are _generated_
  from it (`tokens.css`, committed, with a test that fails if it drifts). See `packages/tokens/README.md`.
- **Why Radix UI (not React Aria).** Radix gives unstyled, battle-tested, WAI-ARIA-conformant primitives
  (Dialog, Tabs, Tooltip, Toast, Checkbox, Switch) with a small component-per-primitive API that composes
  naturally with CSS Modules and our own tokens. React Aria is more comprehensive (date pickers, tables) but is
  hook-based and pulls you toward its own styling and collection model; we do not need that breadth yet. Where
  a native element is the most accessible choice (Select, Input, DataTable's `<table>`), we use the native element.
- **Why CSS Modules (not CSS-in-JS / vanilla-extract).** Zero runtime, plain CSS that reads the token variables,
  scoped class names, great DevTools, and a single extracted `styles.css` for consumers. Theming is entirely CSS
  variables, so switching themes never re-renders React.

## Package map

| Package                | Purpose                                                                                                                                                                                         | Docs                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `@platform/tokens`     | Color roles (light/dark), spacing, radius, type scale, shadows, motion. WCAG-AA contrast is unit-tested.                                                                                        | `packages/tokens/README.md`          |
| `@platform/ui`         | Button, IconButton, Input, Textarea, Select, Checkbox, Switch, Field, Card, Badge, Tabs, Dialog, Toast, Tooltip, Skeleton, Spinner, EmptyState, DataTable, AppShell, PageHeader, ThemeProvider. | `packages/ui/README.md`, the gallery |
| `@platform/auth-web`   | `AuthProvider`, `useAuth`, `useIdToken`, `RequireAuth`, Google + email-link sign-in, emulator support, stub client.                                                                             | `packages/auth-web/README.md`        |
| `@platform/api-client` | `createApiClient` (Bearer, 401 refresh-and-retry-once, RFC 7807 → `ApiError`), `ApiProvider`, `useApiQuery`, `useApiMutation`.                                                                  | `packages/api-client/README.md`      |
| `@platform/gallery`    | Every component in light and dark with live controls, token reference, and a signed-in demo shell.                                                                                              | `apps/gallery`                       |

## Using the packages in an app

```tsx
import '@platform/ui/styles.css' // tokens + base styles + all component styles (import once)
import { ThemeProvider, ToastProvider, AppShell } from '@platform/ui'
import { AuthProvider, RequireAuth, getFirebaseConfigFromEnv } from '@platform/auth-web'
import { ApiProvider, createApiClient } from '@platform/api-client'
```

See `apps/README.md` for the full recipe and `apps/gallery/src/demo/` for a complete working example.

## Conventions

- **TypeScript strict**, plus `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, no unused locals/params.
- **Exact dependency versions** everywhere (`save-exact=true`); one version per dependency across the workspace.
  `scripts/check-versions.mjs` (part of `pnpm lint`) enforces both. Workspace deps use `workspace:*`.
- **Components**: one folder per component (`Name.tsx`, `Name.module.css`, `Name.test.tsx`); typed props that
  extend the native element's props; `forwardRef` on DOM leaf components; CSS reads only `--pp-*` tokens
  (never raw colors); no snapshot tests, test behavior through roles and keyboard.
- **Tokens**: edit `packages/tokens/src/*.ts`, run `pnpm tokens:generate`, commit `tokens.css`.
- **No secrets in the repo.** Firebase _web_ config is identifiers, not secrets, but still comes from
  `VITE_FIREBASE_*` env vars (`.env.example` documents them; `.env*` is git-ignored). Never put service-account
  keys or admin credentials in a frontend.
- **Formatting**: Prettier (no semicolons, single quotes, 100 cols). `pnpm format` fixes everything.

## Accessibility approach

Accessibility is a property of the components, not a checklist for apps.

- **Semantics first**: native elements where they win (`<button>`, `<select>`, `<table>` with `<caption>`,
  `scope`, `aria-sort`), Radix primitives where a widget pattern is needed (Dialog, Tabs, Tooltip, Toast,
  Checkbox, Switch). Radix supplies roles, aria wiring, focus trapping/restoration, roving tabindex.
- **Keyboard**: everything is operable without a pointer. Tests drive components with `user-event`'s keyboard
  (Tab, Enter, Space, Arrows, Home/End, Escape) and assert focus, not just output.
- **Names and descriptions**: `IconButton` requires a `label`; `Dialog` requires a `title`; `DataTable`
  requires a `caption`; `Field` links label, hint and error to the control by id (`aria-describedby`,
  `aria-invalid`, `role="alert"` for errors).
- **Contrast**: every text/background and meaningful-graphic token pair is asserted in a unit test
  (4.5:1 text, 3:1 UI) for both themes. One focus ring (`--pp-color-focus-ring`) is used everywhere.
- **Color is never the only signal** (badges carry text; the switch thumb moves; errors have an icon + text).
- **Motion**: durations collapse and shimmer/spinner animation stops under `prefers-reduced-motion`.
- **Responsive and zoom-safe**: spacing/type use `rem`; AppShell is a drawer below 768px; tables scroll in a
  focusable region; skip link + landmarks (`header`, `nav`, `main`) in AppShell.
- **Dark mode**: follows `prefers-color-scheme`; `data-theme="light|dark"` on any element forces a theme for that
  subtree (the gallery shows both side by side). `ThemeProvider` persists a user choice.
- **Not yet covered**: automated axe/browser testing and screen-reader passes on real devices. The unit
  tests check semantics and keyboard behavior in jsdom; a Playwright + axe job is the natural next step.

## What's next

1. **React Native / Expo reuse.** `@platform/tokens` is already platform-neutral (hex strings, px numbers,
   composite text styles, shadow layers, bezier arrays, no DOM or CSS types). An Expo app can import the
   `themes`, `spacing`, `radius`, `textStyles`, `motion` objects directly and map them to `StyleSheet`
   (plus a `useColorScheme` hook to choose `themes.light | themes.dark`). `@platform/api-client`'s
   `createApiClient` and `ApiError` use only `fetch`, `Headers` and `URLSearchParams`, so they run in React
   Native unchanged; only the `@tanstack/react-query` hooks need the (also RN-compatible) TanStack Query.
   Auth would need a native-appropriate `AuthClient` (e.g. `@react-native-firebase/auth`) behind the same
   interface. `@platform/ui` is DOM-only by design; RN gets its own `ui-native` package consuming the same tokens.
2. Playwright + axe accessibility checks in CI against the gallery build.
3. Publish packages (changesets) once a second repo needs them; today apps consume them via the workspace.
4. Adding a product module: see `apps/README.md` (example: `apps/waiting-on`).
5. Visual regression snapshots of the gallery (light + dark) for token and CSS changes.
