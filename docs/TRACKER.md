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
- [~] 2.1 Design language v2 (agent D, dispatched, branch `phase-2/design`): tokens, restyled UI kit, new components (Stat, Sparkline, Avatar, PersonaBadge, Stepper, CommandPalette, Logo, ProductMark...), gallery, `docs/design/brand.md`
- [ ] 2.2 Public site (agent S): home, six product pages, platform, security, pricing, docs landing, about, 404, SEO tags, screenshots
- [ ] 2.3 Workspace shell (agent W): sign-in, session from `/me`, persona-aware nav, module mounting + per-module API client, Today feed, onboarding, ⌘K, account, demo mode
- [ ] 2.4 Admin console (agent A): users, roles matrix, usage analytics, audit, flags, plans
- [~] 2.5 Backend (agent F, dispatched with 2.1, branch `phase-2/flags`): feature flags in platform-service (+ evaluate endpoint), `GET /v1/admin/users/lookup`
- [ ] 2.6 Product modules + redesign pass, one agent per app: waiting-on, consent, home-pulse, ask-your-life, digital-legacy, family-treasury, hub→core
- [ ] 2.7 Integration and QA: merges green, `dev/up.sh` starts workspace + site, browser pass as MEMBER/DEVELOPER/ADMIN/OWNER, screenshots, docs, commit (ask before push)

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
- [ ] 4.D `ml-service` (Python/FastAPI): trained seasonal forecast + anomaly model for Home Pulse; model card; integration + fallback to MAD
- [ ] 4.E Tests for all of the above; honest limits written down

## Phase 5: Hardening and presence
- [ ] 5.A OpenTelemetry on all JVMs → collector → Tempo/Prometheus/Loki → Grafana dashboards as code
- [ ] 5.B Helm chart for all services; kind cluster smoke test in GitHub Actions  (gate: ask before installing kind/k6 locally)
- [ ] 5.C Image builds (GHCR), Trivy scan, Dependabot, SBOM
- [ ] 5.D Playwright suite per persona; contract tests; k6 load run with numbers in README
- [ ] 5.E OWASP ZAP baseline in CI; threat model; ADRs
- [ ] 5.F Free live demo (frontends in demo mode on Firebase Hosting), screenshots, architecture diagrams, README overhaul, resume bullets

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
