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
- Existing tests must keep passing: backend `./mvnw verify` (745 at start of v2), frontend `pnpm test` (1,188).
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
- [ ] 1.B `gateway`: routes to all services, firebase credential → exchange (cached), request id, CORS
- [ ] 1.B Per-plan rate limiting (Bucket4j) and monthly quota check; 429 problem responses with headers
- [ ] 1.B Usage event emit to Kafka `platform.usage.v1` (reactor-kafka), never blocks the request path
- [ ] 1.C `platform-service`: usage consumer (idempotent) → `platform.usage_events` hypertable + continuous aggregates
- [ ] 1.C Plans/quotas tables + seed; `/internal/v1/quota/{principalId}`
- [ ] 1.C Owner analytics API (`usage:read:all`) and self usage API (`usage:read:self`): totals, by service, by user, errors, latency p50/p95, active users
- [ ] 1.D Dev stack: compose Kafka, `up.sh` starts gateway + platform-service, services in `platform` mode, Vite proxies → gateway
- [ ] 1.D CI: workflow builds new modules; Kafka-using tests use Testcontainers
- [ ] 1.E End-to-end proof: sign in (dev IdP) → gateway → service; usage rows appear; MEMBER blocked from admin API, OWNER allowed; 429 reproduced
- [ ] 1.F Full `./mvnw verify` green, clean-checkout build, tracker + README updated, local commit

## Phase 2: Front door
- [ ] 2.0 Design language: brand, tokens v2, typography, motion principles (use the frontend-design skill)
- [ ] 2.A `site`: home (hero, how it works, products, security, developers, plans, FAQ), per-product pages, docs entry, live-demo link
- [ ] 2.B `workspace` shell: single sign-in, app launcher, persona-aware nav, onboarding flow, ⌘K palette, notifications
- [ ] 2.B Module contract + embed Waiting On, Consent, Home Pulse, Ask Your Life, Digital Legacy, Family Treasury, Hub features (staged; standalone apps keep working)
- [ ] 2.C "Today" home: cross-product feed (due follow-ups, alerts, reminders, approvals)
- [ ] 2.D Admin console: users + roles + suspend, support sessions, plans/flags, usage analytics (owner), audit log viewer
- [ ] 2.E Per-product redesign pass: purposeful empty states, first-run guidance, real product screens (not generic tables)
- [ ] 2.F Visual QA in browser at desktop + phone, light + dark; frontend tests, lint, typecheck, build green; commit

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

## Known issues / notes
- Seven product apps currently each have their own sign-in and Vite proxy; Phase 1.D repoints proxies at the gateway.
- Colima is 6 GB; raise before running Kafka alongside eight services.
- GitHub Actions CI has never been run on GitHub; first run result unknown (owner to check, or `gh` login needed).
- claude-mem observer credentials expired (owner to run `claude auth login`); memory notes are not being saved by it.
