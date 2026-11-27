# My-Trove v2 tracker

**If you are resuming after a context reset, read in this order:** this file, then
[`docs/superpowers/specs/2026-11-21-trove-platform-v2-design.md`](superpowers/specs/2026-11-21-trove-platform-v2-design.md)
(the contracts: personas, permissions, token claims, usage event), then the current phase's plan in
`docs/superpowers/plans/`. Update this file at every task boundary. Nothing is "done" until it is verified
(tests run, output read) and ticked here.

Owner's brief (2026-11-21): implement all of it, plan well, keep cost at zero, make it look like a real platform
(PaaS) that helps land jobs. Owner approved the 20-point proposal and the design doc. Owner pre-approved: parallel
agents, local commits. **Ask first:** pushing to GitHub, installing software or downloading models (Ollama, kind, k6),
anything that costs money, deleting data.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done and verified · `[!]` blocked (reason on the line) · `[-]` dropped

## Working agreements
- One git branch per workstream in a worktree (`phase-N/<name>`); merge to `main` locally after verification. Never push without a yes.
- Pre-wire shared files (root `pom.xml`, `sql-jooq/pom.xml`, compose) before parallel work so merges stay trivial.
- Existing tests must keep passing: backend `./mvnw verify` (745 at start of v2; 1,027 after Phase 1), frontend `pnpm test` (1,188).
- Backend tests need Docker: `export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`
- Dev stack: see `dev/README.md`. Real Firebase project id `personal-platform-af952`; owner email `dheerajdheeru3211@gmail.com`.
- Never commit `.env.local`, `dev/.state/`, keys. Run the secret scan before each push.
- Honest status in READMEs: say what is verified and what is not.

## Phase 0: setup
- [x] Design doc written and approved
- [x] Tracker written (this file)
- [x] Colima resized to 4 CPU / 10 GB (needed for Kafka + observability)
- [x] Phase 1 plan written: `docs/superpowers/plans/2026-11-21-phase-1-platform-core.md`

## Phase 1: Platform core
Execution: 4 agents in git worktrees after pre-wiring: A-auth (plan tasks 1-3, branch `phase-1/auth`), A-lib (tasks 4-5, `phase-1/lib`), B (tasks 6-8, `phase-1/gateway`), C (tasks 9-11, `phase-1/platform`). Coordinator merges, then tasks 12-13. Status of each agent is noted below as it changes.
- Agents A-auth, A-lib, B, C dispatched 2026-11-21 (background, each in a worktree on its branch; use `ListAgents` and `git worktree list` to find them after a context reset). Their final reports arrive as notifications; verify each in the real repo (run its tests) before merging. Merge order: lib, auth, platform, gateway; then swap `@PreAuthorize` for `@RequiresPermission` in auth/platform-service; then tasks 12-13.
Contracts to honour are in design doc section 5. Workstreams run in parallel after pre-wiring.
- [x] 1.0 Pre-wire: new modules in root pom (`gateway`, `platform-service`), `platform` schema + jOOQ execution, compose Kafka (commit 63befa5; Spring Cloud 2026.0.0 BOM resolves on Boot 4.1.2)
- [x] 1.A RBAC in `auth`: roles/permissions/user_roles migration, seed personas, USER→MEMBER, bootstrap→OWNER, permission catalogue (merged; auth 53 tests, sql-jooq 60)
- [x] 1.A Token exchange endpoint + JWKS + `permissions_version`; admin APIs (list users, assign/revoke role, suspend) with guardrails and audit table (dev stack needs `APP_PLATFORM_KEY_ENCRYPTION_KEY`; ADMIN cannot touch any ADMIN/OWNER target; MEMBER is baseline and irrevocable; bootstrap emails re-granted OWNER on login)
- [x] 1.A `platform-security`: `app.security.mode=platform`, platform-token decoder, `@RequiresPermission`, authorities converter, test helpers (merged; 42 tests; consent-gateway 158 unchanged; helper `PlatformTestTokens` in src/main; only consent-gateway built its own decoder)
- [x] 1.A Permission matrix test (`AdminApiTest`, 27 tests, auth endpoints; platform-service matrix is in 1.C)
- [x] 1.B `gateway`: routes to all services, firebase credential → exchange (cached), request id, CORS (merged; 118 tests; Spring Cloud compatibility verifier disabled because 2026.0.0 expects Boot 4.2, re-enable on upgrade)
- [x] 1.B Per-plan rate limiting (Bucket4j) and monthly quota check; 429 problem responses with headers
- [x] 1.B Usage event emit to Kafka `platform.usage.v1` (reactor-kafka), never blocks the request path
- [x] 1.C `platform-service`: usage consumer (idempotent) → `platform.usage_events` hypertable + continuous aggregates (merged; 64 tests; sql-jooq now 68)
- [x] 1.C Plans/quotas tables + seed; `/internal/v1/quota/{principalId}`
- [x] 1.C Owner analytics API (`usage:read:all`) and self usage API (`usage:read:self`): totals, by service, by user, errors, latency p50/p95, active users
- [x] 1.D Dev stack: compose Kafka, `up.sh` starts gateway + platform-service, services in `platform` mode, Vite proxies → gateway (apps now use `VITE_API_BASE_URL=http://localhost:8080/api/<service>`; frontend not re-driven in a browser yet)
- [x] 1.D CI: workflow builds new modules; Kafka-using tests use Testcontainers (the aggregate `./mvnw verify` already covers them)
- [x] 1.E End-to-end proof: sign in (dev IdP) → gateway → service; usage rows appear; MEMBER blocked from admin API, OWNER allowed; 429 reproduced (`dev/e2e-phase1.sh`: 33/33 checks passed)
- [x] 1.F Full `./mvnw verify` green: 12 modules, 1,027 tests (was 745), 0 failures; tracker + README updated, committed locally (push awaits owner's yes)

## Phase 2: Front door
Plan: `docs/superpowers/plans/2026-11-21-phase-2-front-door.md` (module contract is in it and in `packages/workspace-kit`). Order: 2.1 alone, then 2.2/2.3/2.4/2.5 in parallel, then 2.6 in batches. **No new dependencies after 2.1 merges** (lockfile conflicts); ask the coordinator.
Deferred on purpose (not built in Phase 2): support "view as user" sessions (needs a token `act` flow end to end); mention honestly in docs, do not fake in UI.
- [x] 2.0 Pre-wiring: `packages/workspace-kit`, `module.tsx` stubs in all 7 apps, skeletons `apps/site` (5191), `apps/workspace` (5190), `packages/admin-console`; frontend 1,193 tests green
- [x] 2.1 Design language v2 (merged): "a vault you can lend from" identity (stone-green paper, patina accent, brass, dark vault surface, Young Serif + Instrument Sans), 15 new components, ~30 icons, illustrations, `docs/design/brand.md`; frontend 1,525 tests green. Use `data-product="<id>"` to apply a product accent and `data-surface="vault"` for the dark surface; apps do not set these yet (workspace and module agents wire them)
- [x] 2.2 Public site (merged; 35 tests; 9 screenshots in `docs/screenshots/site-*.png`; og/sitemap use placeholder origin `https://my-trove.example`, replace at deploy; Docs/Platform/Pricing copy mentions the admin console and workspace demo, reword if those slip; full-workspace `pnpm test` showed load-dependent flakes in hub and ask-your-life tests, re-run on a quiet machine): home, six product pages, platform, security, pricing, docs landing, about, 404, SEO tags, screenshots
- [x] 2.3 Workspace shell (merged; 108 tests; 11 screenshots `docs/screenshots/workspace-*.png`; admin gated by `users:read || usage:read:all` so AUDITOR can enter; module `useTodayItems` must return stable values (a Date.now()-based `dueAt` loops); not yet run against the live stack): sign-in, session from `/me`, persona-aware nav, module mounting + per-module API client, Today feed, onboarding, ⌘K, account, demo mode
- [x] 2.4 Admin console (merged; 139 tests; 10 screenshots `docs/screenshots/admin-*.png`; reaches the platform service via `../platform` URL normalisation from the auth client; dev harness on port 5192; NOT yet run inside the workspace or against the live gateway; `lookup` needs `users:read`, so audit-only roles see unknown names): users, roles matrix, usage analytics, audit, flags, plans
- [x] 2.5 Backend: feature flags in platform-service (+ evaluate endpoint, audit table), `GET /v1/admin/users/lookup` (merged; platform-service 84, auth 63, sql-jooq 70 tests; flags: ADMIN and OWNER hold `flags:manage`): feature flags in platform-service (+ evaluate endpoint), `GET /v1/admin/users/lookup`
- [x] 2.6 Product modules + redesign pass, all seven merged: waiting-on, consent, home-pulse, ask-your-life, digital-legacy, family-treasury, hub as `core`. Frontend after all merges: 177 files, 2,018 tests, lint/typecheck/build green. Standalone apps still work in demo mode.
- [~] 2.7 Integration and QA. DONE: workspace sets `data-product` on `<body>` for portalled dialogs; `dev/web.sh` + `use-firebase.sh` cover workspace/site; live drive of the workspace against the real stack: OWNER crawl of 36 routes (all 7 products, admin console, account) with 0 failed API calls and 0 console errors; MEMBER sees no Admin link and gets a forbidden page at /app/admin/users; owner usage analytics show real metered traffic (`docs/screenshots/live-admin-usage-owner.png`); Phase 1 e2e rerun 33/33. FOUND AND FIXED: Flyway refused plain V3 after ext V100+ on an existing DB, so `spring.flyway.out-of-order=true` is now set in every service with an `_ext` location. Full backend verify: 12 modules, 1,056 tests, 0 failures; committed locally; STILL TO DO (can move to Phase 5 polish): re-read the site copy against what actually shipped, visual QA of every screen at 375px inside the workspace, a dark-mode pass in the workspace. Original item:: merges green, `dev/up.sh` starts workspace + site, browser pass as MEMBER/DEVELOPER/ADMIN/OWNER, screenshots, docs, commit (ask before push)

## Phase 2.5: Visual transformation (owner feedback 2026-11-22; Phase 3 is ON HOLD until this is accepted)
Owner verdict: UI looks 10-15 years old, static, no animation, basic colours, Waiting On / Consent / Ask Your Life unreadable (their CSS was not loaded in the workspace: FIXED in commit "fix: load ... stylesheets"), Add-content form terrible. Household, Family Treasury, Home Pulse judged clean; Digital Legacy "a notepad". Owner wants: modern animation libraries, scroll-driven animation, page entrances, micro-interactions, depth, richer colour, award-level feel, complete transformation. LESSON: never sign off UI from headings/API checks; LOOK at screenshots inside the workspace, light and dark, desktop and phone.
- [ ] M0 Motion + visual foundation (deps: `motion`, `lenis`, `gsap`): primitives (Reveal, Stagger, CountUp, Parallax, SpotlightCard, Magnetic, PageTransition, Aurora/mesh backgrounds, Marquee, ScrollProgress, SplitText), richer palette (gradients, glow, glass, depth), reduced-motion respected
- [x] M1 Public site MERGED and viewed (cinematic hero with live dial, pinned gateway story, numbered product cards, product switcher with mini dashboards, bento sections, plans, FAQ, accessibility panel). Known weak spots from the agent: platform bento at 1440 not re-checked, hover sheet covers product name, inner-page content offset vs hero, BigStat/CountUp fractional flicker in the shared UI when no `format` is passed
- [ ] M2 Workspace shell, sign-in, Today, admin visuals: page transitions, staggered entrances, animated stats and charts, bento dashboards
- [ ] M3 Waiting On, Consent, Ask Your Life (incl. Add content form) rebuilt
- [ ] M4 Home Pulse, Family Treasury, Household, Digital Legacy polished to the same bar
- [ ] M5 Owner review in real browser, fixes, push

## Phase 2.7: Audit against the owner's complaints (2026-11-22, in progress)
Owner: plain `localhost:5190` went to demo; Google always signed in as dev; persona login not working; Home Pulse energy data source unexplained; products lack a clear working purpose. FIXED so far (commits 768b294 and earlier): plain front-door visit leaves demo; sign-out leaves demo; `?demo=0` escape; `dev/seed-personas.sh` creates real owner, admin, developer, member and auditor accounts.
Four audit agents, each on its own branch from main, briefs in `docs/superpowers/briefs/60-64`: `audit/auth-personas`, `audit/waiting-consent-ask`, `audit/home-pulse`, `audit/household-treasury-legacy`. Their reports arrive as notifications; verify each in the real repo, merge, and rerun the flows live before reporting to the owner.

## Phase 2.6: Make it real (owner audit of pointless things, 2026-11-22)
Status of the Phase 2.5 agents: the earlier session's agents died on a restart; partial work is on `phase-2.5/site|workspace|products-a|products-b`; fresh agents continue from those branches using `docs/superpowers/briefs/*.md` (also dispatched: H = Home Pulse simulator backend on `phase-2.5/home-pulse-sim`). Agents cannot be resumed across a session restart: always keep briefs in files and commit WIP.
Audit, things that exist but do nothing useful for a real user (fix order):
1. Home Pulse needs a physical smart plug; no hardware means an empty product; curl snippet showed a fake host. Backend simulator MERGED and verified (`POST/DELETE /v1/appliances/{id}/simulation`, `simulated` flag, home-pulse 146 tests); UI explainer, real ingest URL and Simulate button are in the products-b agent's scope.
2. Notifications never reach anyone: reminders, follow-up nudges, legacy check-in reminders, trustee invites use a log-only sender. FIX: in-app notification centre (real) + Mailpit (free local SMTP, UI on :8025) so emails visibly send in dev.
3. Waiting On: reply-by-email address is dead (no inbound email infrastructure); letters are drafts only. FIX: be honest in UI; paste-a-reply flow; Mailpit for sending.
4. Consent: nothing ever asks for access (only seeded demo clients). FIX: a sample third-party app ("Stride Shoes") that really calls the gateway, plus the developer portal in Phase 3.
5. Family Treasury / Household: adding a member requires typing a Firebase uid; invites need other real users. FIX: invite by email/code with a copyable link; seeded second user in dev.
6. Digital Legacy: trustees are other people and invites are never delivered. FIX: invite link flow + local trustee portal walkthrough.
7. Ask Your Life: "semantic" search is a hashing stand-in, no answers. FIX: Phase 4 (real embeddings + LLM answers).
8. Feature flags: nothing reads them. FIX: wire two real flags into the workspace or label as developer-only.
9. DEVELOPER persona has no screens until Phase 3. 
10. Seven standalone product apps duplicate the workspace; large mock backends duplicate real ones. DONE (2026-11-26, brief 85): the standalone shells are retired; every product is a workspace module, the trustee portal is served by the workspace at `/trustee`, and the mocks stay for the workspace's `?demo=1` mode and the tests.
11. Promo/decorative cards that promote nothing (being removed by the redesign agents under the NO POINTLESS UI rule).

## Phase 3: Developer platform
- [ ] 3.A Developer apps: register OAuth clients (via consent-gateway), scopes catalog, workspaces/teams
- [ ] 3.B API keys (hashed, scoped, rotatable) accepted by the gateway → `service` platform tokens
- [ ] 3.C Webhooks: signed deliveries, retries with backoff, delivery log, replay (Kafka consumer)
- [ ] 3.D OpenAPI per service, aggregated docs, generated TypeScript SDK, API playground, sandbox seeded data, developer request-log viewer
- [ ] 3.E Connected apps screen for members (see, revoke) + polished consent screens
- [ ] 3.F `mcp-server`: consent-scoped tools (list follow-ups, search notes, appliance status, ledger summary), audited
- [ ] 3.G Persona e2e: developer can create app + key and call API; member cannot; revocation works

## Phase 4: AI and ML  (gate: ask owner before installing Ollama / pulling models)
- [ ] 4.A Embedder + LLM provider interface in Ask Your Life; Ollama provider; streaming answers with citations
- [ ] 4.B RAG evaluation harness (gold set; recall@k, MRR, faithfulness check) with published numbers
- [ ] 4.C Trove Assistant in workspace using MCP tools, consent and audit
- [x] 4.D `ml-service` (Python/FastAPI, Docker only, :8095): seasonal time-of-day baseline + calibrated residual z-score, 24 h forecast, train/score/forecast/health/metrics; home-pulse `AnomalyModel` seam with MAD fallback, `decidedBy` on alerts (API + UI). Held-out simulator eval (90 episodes): ML precision 0.982 / recall 0.786 vs MAD 1.000 / 0.571 (`ml-service/MODEL_CARD.md`). Simulated data only. Helm `mlService.enabled` rendered, not deployed; CI/release jobs NOT YET RUN (need push); frontend checks not run in the worktree
- [ ] 4.E Tests for all of the above; honest limits written down

## Phase 5: Hardening and presence
- [x] 5.A OpenTelemetry traces (OTLP → Jaeger v2), Prometheus metrics on a private management port, Grafana dashboard as code, `dev/e2e-observability.sh` (plan 2026-11-23; Loki/log shipping not done)
- [~] 5.B Helm chart `deploy/helm/my-trove` (lint, kubeconform 30/30 valid, default-deny NetworkPolicy, hardened pods) and single-host Compose `deploy/compose/` (real images pass e2e-phase1 33/33, personas 73/73, waiting-consent-ask 26/26, developer 24/28: webhook receiver unreachable from containers). kind smoke test `deploy/kind/smoke.sh` written; runs only in GitHub Actions, NOT YET RUN (needs push)
- [~] 5.C `deploy/docker/` images (12 build; JRE 21.0.13_9 noble multi-arch, nginx 1.31.7 + apk upgrade), `release.yml` (Trivy gate, Syft CycloneDX SBOM, GHCR push from main), Dependabot. Local Trivy OS scan clean on 4 images; Java DB download failed locally, so jar CVEs only in CI. NOT YET RUN in CI (needs push)
- [~] 5.D k6 baseline DONE (`docs/perf/2026-11-23-baseline.md`, all thresholds pass). Contract tests DONE (brief 88): 62 schemas in `contracts/`, checked by a `*ContractTest` in each of 7 services and by the workspace demo-mock Vitest suite; 3 mock drifts fixed. Per-persona browser suite `dev/e2e-personas-browser.mjs` written; NOT yet green live (last run 9/21: the running stack had jars rewritten under it, see 88-report)
- [~] 5.E ZAP baseline in `release.yml` with `deploy/zap/rules.tsv` (NOT YET RUN), threat model `docs/security/threat-model.md`, ADRs 0001-0006 `docs/adr/`
- [~] 5.F README deploy/status sections and `docs/deploy.md` DONE; live demo hosting, diagrams and resume bullets not done (hosting needs the owner's account)

## Deployment readiness (2026-11-26)
Backend `./mvnw verify` 1,325 tests, 0 failures; frontend 2,240 tests, lint/typecheck/build green. Fixed in this pass: nine services' observability tests (metrics export is off in Spring Boot tests; health moved to the management port), dev IdP bind address (`DEV_IDP_HOST`). Everything is committed locally on `main`, NOT pushed: the kind smoke, ZAP, Trivy-in-CI and GHCR push all start on the first push.

## Product pass (2026-11-26): tested as a user, then fixed what did not make sense
Walked every product as owner and member (browser), plus persona walk, layout check (390/1440, light/dark), persona UI e2e 31/31, e2e-phase1 35/35, notifications 9/9.
- [x] People in the workspace were rate-limited and quota-capped like API traffic (429 while browsing; 10k/month gone in days). Now: plans limit API keys; people get a 600/min fair-use ceiling and no monthly quota (ADR 0007). Plan card shows activity, not a quota.
- [x] Waiting On follow-ups stopped forever when Temporal lost a workflow (dev server restart). Reconciler resumes them at the item's real stage and dates; 9 resumed live. Overdue next step reads "due now", never a past date.
- [x] Animated numbers flickered decimals mid-count ("1,393.19 requests").
- [x] Content-Security-Policy on both web images (hash of the one inline script, API and sign-in origins only); 0 violations across 45 routes. ZAP now fails CI without it.
- [x] Email works with real relays: SMTP login and required STARTTLS (chart, Compose, docs); password redacted from settings text.
- [x] CI vulnerability gate: lz4-java, snappy-java (Kafka client) and guava (Temporal SDK) pinned to fixed versions; flaky first-scrape test hardened; GHCR push retries.
- [ ] Ask Your Life semantic search still uses the local stand-in embedder (real embeddings need Ollama: ask before installing).

## Backend weight (2026-11-26): owner asked why the frontend outweighs the backend
Briefs 80-85 in `docs/superpowers/briefs/` (reports 81-85 alongside). Agents in worktrees; merged and verified on main.
- [x] 81 Server owns derived logic: Waiting On next step (workflow state, else stored plan), Consent request deadline (`expiresAt`), Home Pulse day counts; client guesses deleted. Audit table in 81-report.
- [x] 82 `mcp-server` (:8090): MCP over the official Java SDK, four read-only tools (Waiting On, Ask Your Life, Home Pulse, Family Treasury), `mcp:use` permission (DEVELOPER/ADMIN/OWNER), append-only audit in schema `mcp`; live `dev/e2e-mcp.sh` 12/12. OPEN: API keys can connect but read no product data (service tokens never act as their owner; needs an auth token-model change).
- [x] 83 Ask Your Life semantic search on Model2Vec potion-base-2M (MIT, ~8 MB, pure Java, 64-d zero-padded to 384), re-embeds on model change, cited extractive answers. Gold set (30 paraphrase pairs): recall@3 0.867 / MRR 0.723 vs hashing 0.300 / 0.233. CI downloads the pinned model (`-Dfetch-model`).
- [x] 84 Inbound email: SMTP listener in waiting-on (SubEthaSMTP 7.2.2, off by default, on in dev :2525), refuses relaying and closed items, quoted-history stripping, same pipeline as the webhook; live `dev/e2e-inbound-email.sh` 6/6 through the gateway.
- [x] 85 Standalone product app shells retired (workspace mounts every product; demo-mode mock APIs kept for `?demo=1`; trustee portal moved into the workspace at `/trustee/*`). UI e2e for Waiting On/Consent/Ask now runs through the workspace (10/10).
- Size after: Java main 33.6k (was 30.5k), test 27.5k; TS non-test 72.6k (was 76.1k), of which 9.2k is demo-mode mock APIs.

## Pending items finished (2026-11-27)
- [x] 86 API keys act for their owner: service tokens carry `act`; auth issues 5-minute delegated tokens with the intersection of owner and key permissions; mcp-server audits app and owner. `dev/e2e-mcp.sh` 24/24 live.
- [x] 87 `ml-service` (Python in Docker): seasonal baseline + calibrated residual score; home-pulse falls back to MAD; alerts say which model decided. Held-out simulator faults: ML precision 0.98 / recall 0.79 vs MAD 1.00 / 0.57 (simulated data only; see MODEL_CARD).
- [x] 88 `contracts/`: 62 JSON Schemas checked against both the services and the demo mocks (3 mock drifts fixed); `dev/e2e-personas-browser.mjs` 27/27 live.
- [x] 89 Trove Assistant in the workspace over the MCP tools (intent routing, no generative model, audited, DEVELOPER/ADMIN/OWNER); `dev/e2e-assistant.mjs` 12/12 live.
- [x] Architecture diagrams (`docs/architecture.md`), resume bullets (`docs/resume.md`), CI annotates failing tests publicly.
- [x] Merged worktrees and branches removed (only `main`).
- [ ] Follow-up: on the developer API-key page, values typed in the first second after opening can be lost (seen only by an automated browser; cause not found).
- [ ] Needs the owner: a public deployment (a server and Firebase web config), the Dependabot PRs (review on GitHub), the CI backend failure on GitHub (named by the new annotation step after the next push).

## Decisions log
- 2026-11-21: Gateway + platform token chosen over library-only RBAC and over a service mesh (design doc §4).
- 2026-11-21: Workspace app hosts products as modules (not micro-frontends).
- 2026-11-21: Rate limiting in-memory (Bucket4j); no Redis. Kafka via `apache/kafka` KRaft.
- 2026-11-21: Project name My-Trove; Java packages stay `com.personalplatform.*`, frontend `@platform/*`.

## Phase 1 notes (read before Phase 2)
- Integration fixes made by the coordinator after merge: `auth` accepts platform tokens via `DualTokenDecoder` (`app.platform.accept-platform-tokens=true`); `platform-service` chain maps token permissions to authorities.
- Auth decisions: ADMIN cannot touch any ADMIN/OWNER target; MEMBER is a baseline role that cannot be revoked; bootstrap emails re-granted OWNER on login; role changes reach a cached credential within 60 s (a fresh credential sees them at once).
- Gateway passthrough (service does its own auth): home-pulse `/v1/ingest/**`, waiting-on `/v1/webhooks/**`, consent `/v1/oauth/**` `/.well-known/**` `/v1/gateway/**`, shared `/v1/files/download`, digital-legacy `/v1/legacy/trustee/**`, auth `/v1/token/exchange` and JWKS. `/internal/**` and `/actuator/**` are blocked at the gateway.
- Plans: FREE 120 rpm / 10k month, PRO 600 / 200k, DEVELOPER 1,200 / 1M. `errorRate` counts 5xx only. `top-users` excludes anonymous.
- `@RequiresPermission` exists in `platform-security`; auth and platform-service still use the equivalent `@PreAuthorize("hasAuthority(...)")` (cosmetic swap, optional).

## Known issues / notes
- Seven product apps currently each have their own sign-in and Vite proxy; Phase 1.D repoints proxies at the gateway.
- Colima is 6 GB; raise before running Kafka alongside eight services.
- GitHub Actions CI has never been run on GitHub; first run result unknown (owner to check, or `gh` login needed).
- claude-mem observer credentials expired (owner to run `claude auth login`); memory notes are not being saved by it.
