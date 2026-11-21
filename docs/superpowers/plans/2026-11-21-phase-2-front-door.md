# Phase 2: The Front Door Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox syntax. Progress is mirrored in `docs/TRACKER.md`.

**Goal:** A visitor understands My-Trove in 30 seconds on a public site, signs in once to one workspace that hosts every product as a module, sees a "Today" home across products, and the owner, admins and developers get persona-aware navigation plus an admin console with usage analytics.

**Architecture:** Three new frontends/packages on top of the existing UI kit: `apps/site` (public), `apps/workspace` (signed-in shell that mounts `ProductModule`s), `packages/admin-console` (a module for users, roles, usage, audit, flags). Products stay in their own app packages and expose a `ProductModule` (`src/module.tsx`); the workspace mounts them under `/app/<id>/*`, giving each its own gateway-bound API client. A design-language pass (tokens v2 and UI kit upgrades) comes first and everything else builds on it. Backend gets feature flags and a user lookup so the console can show names.

**Tech Stack:** React 19, TypeScript strict, Vite, react-router-dom 7.18, TanStack Query, Radix UI, CSS Modules, Vitest + Testing Library, Spring Boot (flags endpoints).

**Spec:** `docs/superpowers/specs/2026-11-21-trove-platform-v2-design.md` (sections 2, 5.2, 6) and the Phase 1 results in `docs/TRACKER.md`.

## Global Constraints

- All existing frontend tests stay green (1,188 at the start of Phase 2) and `pnpm lint && pnpm typecheck && pnpm test && pnpm -r build` pass for the whole `ui-common` workspace before a branch is reported done. Standalone product apps (`pnpm --filter @platform/<app> dev`) keep working, including demo mode.
- **No new dependencies** after Task 2.1 merges, except by asking the coordinator (parallel branches cannot safely edit `pnpm-lock.yaml`). Task 2.1 may add dependencies (fonts, animation); the coordinator installs and commits them before any other branch starts.
- Exact versions only in `package.json` (a script checks this). Fonts are self-hosted via `@fontsource*` packages, never loaded from a CDN. Cost stays zero.
- Accessibility: keyboard reachable, visible focus, WCAG AA contrast in light and dark, `prefers-reduced-motion` respected, landmarks and labels. No decoration that blocks content.
- Phone width (375 px) must work for every new screen; no horizontal page scroll.
- The API goes through the gateway: base `http://localhost:8080/api/<service>` for a product, `http://localhost:8080/api` for the workspace; every path is then `/v1/...`. Never call a service port directly.
- Permissions (design 5.2) drive navigation and screens: `products:use`, `usage:read:self`, `usage:read:all`, `users:read`, `users:write`, `roles:assign`, `roles:assign:privileged`, `plans:manage`, `flags:manage`, `audit:read`. Hiding a link is cosmetic; every screen must still handle a 403 from the API gracefully.
- Copy: plain, specific, no marketing filler or invented claims. Anything the product does not do must not be implied. Phase 1 facts the site may state: personas, scoped consent, usage-based plans (FREE 120 requests/min and 10,000/month; PRO 600 and 200,000; DEVELOPER 1,200 and 1,000,000), end-to-end encrypted legacy vault, double-entry ledger, hash-chained audit log.
- Package names: `@platform/<name>`; the module contract lives in `@platform/workspace-kit`.
- Parallel work uses git worktrees on branches `phase-2/<name>`; never edit files owned by another workstream.

## Module contract (pre-wired in Task 2.0, authoritative)

`packages/workspace-kit/src/index.ts` exports:

```ts
type Permission = string
interface ModuleNavItem { to: string; label: string; icon?: ComponentType<{ size?: number }>; end?: boolean; permission?: Permission }  // `to` starts with '/', relative to the module base
interface TodayItem { id: string; title: string; subtitle?: string; dueAt?: string; severity: 'info' | 'warn' | 'danger'; to: string }  // `to` relative to the module base
interface ProductModule {
  id: string            // URL segment and registry key: waiting-on | consent | home-pulse | ask-your-life | digital-legacy | family-treasury | core | admin
  service: string       // gateway route id used for its API client
  title: string; tagline: string; description: string
  accent: string        // CSS color expression from the design tokens
  icon: ComponentType<{ size?: number }>
  nav: ModuleNavItem[]
  requiredPermission?: Permission          // default 'products:use'
  Providers?: ComponentType<{ children: ReactNode }>   // product-specific providers (clock, etc.); the workspace supplies auth, API client, query cache, theme, toasts, router
  Routes: ComponentType                    // renders <Routes>; paths relative to the base
  useTodayItems?: () => { items: TodayItem[]; loading: boolean }
  createDemoFetch?: () => typeof fetch     // in-memory mock API for demo mode
}
function ModuleBaseProvider(props: { base: string; children: ReactNode }): JSX.Element
function useModulePath(): (path: string) => string      // '/new' -> '/app/waiting-on/new'; identity when no provider (standalone apps)
function useModuleNavigate(): (to: string | number, options?: NavigateOptions) => void
const ModuleLink: ForwardRefExoticComponent<LinkProps>  // react-router Link whose `to` goes through useModulePath
const ModuleNavLink: ForwardRefExoticComponent<NavLinkProps>
interface WorkspaceSession { uid: string; email: string | null; displayName: string | null; roles: string[]; permissions: string[]; plan: string; isDemo: boolean; can(p: Permission): boolean }
function WorkspaceSessionProvider(props: { value: WorkspaceSession; children: ReactNode }): JSX.Element
function useWorkspaceSession(): WorkspaceSession   // standalone apps get a permissive default
```

A product's own `App.tsx` keeps working standalone: it wraps `productModule.Routes` in its own layout with no `ModuleBaseProvider`, so `useModulePath` is the identity.

## File Structure

| Path | Responsibility | Task |
|---|---|---|
| `packages/workspace-kit/**` | the contract above | 2.0 |
| `apps/<product>/src/module.tsx` | `productModule` per product (stub in 2.0, real in 2.6) | 2.0, 2.6 |
| `packages/tokens/**`, `packages/ui/**`, `docs/design/brand.md` | design language v2, new components | 2.1 |
| `apps/site/**` | public marketing site | 2.2 |
| `apps/workspace/**` | shell, sign-in, onboarding, Today, palette, account, module mounting | 2.3 |
| `packages/admin-console/**` | admin module (users, roles, usage, audit, flags, plans) | 2.4 |
| `platform-service/**` (flags), `auth/**` (lookup), migrations under `sql-jooq/.../platform/` | backend for 2.4 | 2.5 |
| `docs/TRACKER.md`, `README.md`, `dev/**` | wiring and docs | 2.7 |

## Tasks

### Task 2.0: Pre-wiring (coordinator)
- [ ] Create `packages/workspace-kit` with the contract and tests (`useModulePath` identity without provider and prefixing with one; `ModuleLink` and `useModuleNavigate` resolve under a base; `useWorkspaceSession` default).
- [ ] Add a stub `src/module.tsx` to each of the seven apps exporting `productModule` (real metadata and nav from the current sidebar, `Routes` renders null) plus `"exports": {"./module": "./src/module.tsx"}` and a `workspace-kit` dependency; `core` is the hub's households, reminders, files, activity.
- [ ] Add empty-but-building skeletons `apps/site` and `apps/workspace` and `packages/admin-console` (package.json, tsconfig, vite config, entry), run `pnpm install`, commit lockfile. Verify `pnpm lint typecheck test build` unchanged.

### Task 2.1: Design language (agent D, first, alone)
**Owns:** `packages/tokens/**`, `packages/ui/**`, `docs/design/brand.md`, `apps/gallery/**`.
**Deliverable:** a distinctive identity, not a generic SaaS look. Use the `frontend-design:frontend-design` skill. Brand concept: My-Trove is a vault you can trust and lend from: warm, tactile, calm, precise; avoid default blue-gradient and gray-card dashboards. Decide and document: palette (light and dark, AA contrast, one accent per product, semantic colors), type pairing (self-hosted `@fontsource*`), spacing and radius scale, elevation, motion principles (and reduced-motion), logo mark and wordmark as SVG, an illustration/pattern language made from SVG (for empty states and hero), iconography rules.
**Interfaces produced (additive; existing component APIs and tests must keep working):** new tokens; restyled existing components; new components exported from `@platform/ui`: `Hero`-capable `Section`/`Container`, `Stat` (value, label, delta, sparkline), `Sparkline`, `Avatar`, `PersonaBadge` (OWNER, ADMIN, DEVELOPER, MEMBER, AUDITOR), `Stepper`, `CommandPalette` (controlled; items `{id,label,hint?,group?,onSelect}`; keyboard: open with the caller's hotkey, arrows, Enter, Esc, type to filter), `EmptyState` with illustration slot, `Logo`, `ProductMark` (per product accent glyph), `Callout`, `KeyValueList`, `Timeline`.
- [ ] Tests for every new component (render, keyboard, a11y roles, reduced motion) and a visual gallery page in `apps/gallery` showing light and dark.
- [ ] Brand doc `docs/design/brand.md` with the decisions above and usage rules.

### Task 2.2: Public site (agent S)
**Owns:** `apps/site/**`.
**Deliverable:** pages `/` (hero with a one-line promise, how it works in three steps, the six products with real capabilities, platform/developer section, security section, plans from the constraint values, FAQ, final call to action), `/products/<id>` for each of the six, `/platform`, `/security`, `/pricing`, `/docs` (landing that links to API docs once they exist; honest "coming in a later release" for anything not built), `/about`. Primary actions: "Open the workspace" (`VITE_WORKSPACE_URL`, default `http://localhost:5190`) and "Try the live demo" (`VITE_WORKSPACE_URL/?demo=1`). Meta tags, Open Graph tags, sitemap, favicon, 404 page; dark mode; reduced motion; responsive to 375 px.
- [ ] Tests: every route renders a single `h1`; every internal link resolves; pricing numbers match the constraints; no placeholder text (`lorem`, `TODO`); the product list equals the six real products.
- [ ] Browser check (desktop and phone, light and dark) with screenshots in `docs/screenshots/site-*.png`.

### Task 2.3: Workspace shell (agent W)
**Owns:** `apps/workspace/**`.
**Deliverable:** the single signed-in app on port 5190.
- Auth: Firebase or dev identity provider or demo, via `@platform/auth-web`; a designed sign-in page (not a bare form) that says what My-Trove is in two lines and links to the site; `?demo=1` forces demo mode (stub auth, each module's `createDemoFetch`).
- Session: after sign-in call `GET /api/auth/v1/me` for roles and permissions, and plan; build `WorkspaceSession`.
- Shell: persona-aware sidebar (Home, Products group, Developer placeholder hidden until Phase 3, Admin shown when `can('users:read') || can('usage:read:all')`, Account), top bar with search/⌘K, role badge (`PersonaBadge`), theme, sign out; mobile drawer.
- Module mounting: a registry `src/modules/registry.ts` importing each app's `productModule` and the admin console's module; route `/app/:id/*` renders `Providers` + `Routes` inside `ModuleBaseProvider base="/app/<id>"`, with an `ApiProvider` bound to `${VITE_API_BASE_URL}/<service>` (a separate API client and query cache per module), gated by `requiredPermission` (403 page otherwise).
- Home ("Today"): greeting, a feed from every module's `useTodayItems` (follow-ups due, alerts, reminders, approvals), quick actions, plan and usage meter from `GET /api/platform/v1/usage/me`, empty state that teaches.
- Onboarding: first sign-in wizard (welcome, pick products to pin, one tip per pinned product), stored per user locally; skippable.
- ⌘K palette: navigate to any module page and run quick actions; items come from module `nav` plus workspace pages.
- Account page: profile, role and permissions summary, plan, connected-apps placeholder (Phase 3), sign out.
- [ ] Tests: route gating by permission; persona nav matrix (MEMBER, DEVELOPER, ADMIN, OWNER, AUDITOR); module mounting prefix; ⌘K; onboarding persistence; demo mode loads every registered module without network.
- [ ] Browser check as MEMBER and OWNER against the running dev stack (screenshots in `docs/screenshots/workspace-*.png`).

### Task 2.4: Admin console (agent A)
**Owns:** `packages/admin-console/**` (exports `adminModule: ProductModule`, id `admin`, service `auth`, `requiredPermission` undefined so the module itself gates each screen).
**Deliverable:** Users (search, paginate, view roles, assign or revoke roles with the guardrails' error messages, suspend and restore, plan change for OWNER), Roles (matrix of roles by permissions from `GET /v1/admin/roles`), Usage (owner analytics from `GET /api/platform/v1/usage/summary` and `top-users`: totals, error rate, p50/p95, active users, per-service table, status classes, time series chart with range switcher; top users with names via the lookup endpoint from Task 2.5), Audit (paged `GET /v1/admin/audit` with actor and target names), Flags (list, create, toggle, rollout percentage; `flags:manage`), Plans (read-only plan table). Each screen needs only its own permission (`users:read`, `roles:assign`, `usage:read:all`, `audit:read`, `flags:manage`); charts are small SVG components (no chart library); demo fetch included so the workspace demo works.
- [ ] Tests per screen against a mocked fetch including 403 and error states; guardrail messages; keyboard operation.

### Task 2.5: Backend: feature flags and user lookup (agent F)
**Owns:** `platform-service/**` (flags), `sql-jooq/.../platform/V3__feature_flags.sql` (plain tables) and its schema test, and in `auth/**` only a new lookup endpoint.
**Interfaces produced:**
- `GET /v1/flags` (permission `flags:manage`), `POST /v1/flags`, `PUT /v1/flags/{key}`, `DELETE /v1/flags/{key}`; body `{ key, description, enabled, rolloutPercent (0-100), allowedPlans[]?, allowedRoles[]? }`; `GET /v1/flags/evaluate` (any authenticated principal) returns `{ flags: { "<key>": true|false } }` for the caller: enabled, plan/role allowed, and `hash(uid + key) % 100 < rolloutPercent`, stable per user.
- `GET /v1/admin/users/lookup?ids=<uuid,uuid,...>` in `auth` (permission `users:read`, max 100 ids) returning `[{ id, email, displayName }]`.
- [ ] Tests: persona matrix for flag admin; evaluation determinism and rollout distribution (1,000 synthetic uids within 5 points of the percentage); disabled flag is false regardless of rollout; lookup limits and permission; no unknown ids leak.

### Task 2.6: Product modules (seven agents, in batches)
**Each owns exactly one `apps/<name>/**`** (waiting-on, consent, home-pulse, ask-your-life, digital-legacy, family-treasury, hub as `core`).
- [ ] Implement the real `productModule` (`src/module.tsx`): `Routes` is the app's pages without providers, auth or layout; `Providers` supplies the app-specific context; `nav` is the app's navigation; `useTodayItems` per the product (follow-ups due soon, open alerts, due reminders, pending approvals, and so on); `createDemoFetch` returns the existing mock backend's `fetch`.
- [ ] Replace every hard-coded absolute link and `navigate('/...')` with `ModuleLink`/`useModulePath`/`useModuleNavigate` (tests in standalone mode still pass because the base is empty).
- [ ] Product redesign pass using the design language: a purposeful home (the one thing the user should see first), first-run guidance, specific empty states with an illustration and a primary action, plain copy, no generic table-only pages; keep every existing capability.
- [ ] The standalone app keeps working: its `App.tsx` wraps the same `Routes` in its own layout.
- [ ] Tests: module metadata and nav; links under a base (`/app/<id>`); `useTodayItems` with fixture data; existing app tests still pass.

### Task 2.7: Integration and QA (coordinator)
- [ ] Merge in order: 2.1, then 2.2/2.3/2.4/2.5, then 2.6 batches; keep `main` green after each merge (`pnpm lint typecheck test build`, plus backend tests for 2.5).
- [ ] `dev/up.sh` starts workspace (5190), site (5191) and the products; update `dev/README.md`, `README.md`, `.env.example` files.
- [ ] Drive the workspace in a browser against the live stack as MEMBER, DEVELOPER, ADMIN, OWNER; screenshots; fix what breaks. Check demo mode end to end.
- [ ] Update `docs/TRACKER.md`; secret scan; local commit; ask the owner before pushing.

## Review Focus

1. A MEMBER who types `/app/admin/users` directly sees a clear forbidden page, never a half-rendered admin UI or an infinite spinner (Tasks 2.3, 2.4).
2. A role change made while the user is signed in shows up after the 60-second gateway cache window: the workspace re-reads `/me` periodically and on focus (Task 2.3).
3. Deep links and reload work under `/app/<id>/...` for every product, and browser back/forward behave (Tasks 2.3, 2.6).
4. Two products must not share a query cache entry or API client: switching modules never shows stale data from another product or another user after sign-out (Tasks 2.3, 2.6).
5. Demo mode never makes a network call and is visibly labelled; `?demo=1` cannot be used to reach real data (Task 2.3).
