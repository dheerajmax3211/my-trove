# My-Trove v2: from eight services to a platform

Status: approved by the owner on 2026-11-21 ("go ahead implement it all"). Progress lives in [`docs/TRACKER.md`](../../TRACKER.md).

## 1. Intent

My-Trove today is a set of strong backends (Temporal, Timescale, pgvector, double-entry ledger, Shamir, a consent
token issuer) wrapped in generic dashboards. A visitor cannot tell what it is, authorization is a USER/ADMIN flag,
nothing is metered and there is no developer surface. The owner's goal is a portfolio piece that reads as a
real platform ("PaaS") and lands jobs: a product with a front door, personas, an admin and developer console,
metering and plans, an event backbone, observability, real AI features and real deployment artifacts.

**Concept (owner-approved framing):** My-Trove is a personal-data platform. People keep their life data in one
workspace. The six products are first-party apps built on the platform. Third-party developers get scoped,
user-approved API access to that data, including through AI agents (MCP). The owner operates the platform.

## 2. Goals, non-goals, anti-goals

**Goals**
- A public site that explains the product in 30 seconds and a single signed-in workspace that replaces seven islands.
- Real authorization: personas, permissions, deny by default, enforced in every service, proven by a test matrix.
- A platform layer: gateway, metering, plans and quotas, developer portal, webhooks, MCP server.
- Owner analytics: usage across all users; developers see their own apps; members see only products.
- Heavier, honest infrastructure: Kafka, OpenTelemetry/Prometheus/Grafana, Helm on kind in CI, a trained ML model,
  real RAG with an evaluation harness.
- Cost: zero. Everything runs locally or on free CI.

**Non-goals**: real payments (a simulated billing preview only), multi-region, mobile apps, compliance certification,
rewriting the six products' domain logic.

**Anti-goals (would make this a failure even if it "works")**
- Features that are mocked in the UI but absent in the backend. Anything shown must run.
- Technology added only to lengthen a list. Each piece must do a job a reviewer can see (Kafka carries usage and
  audit events; Helm is exercised by a smoke test in CI).
- Breaking the existing 745 backend / 1,188 frontend tests, or committing a secret.
- A UI that still looks like a generic admin dashboard.

## 3. Constraints
- Mac with 16 GB RAM, 10 CPUs; Colima is currently 4 CPU / 6 GB and should move to 4 CPU / 10 GB for Phase 1+.
- Spring Boot 4.1.2 / Java 21, jOOQ, Flyway, one Postgres schema per service, React 19 + TypeScript strict, pnpm 11.
- Existing conventions hold: UUIDv7 ids, migrations in `sql-jooq/.../db/migration/<schema>/`, parser-unfriendly SQL
  in `<schema>_ext/` with versions >= 100, generated jOOQ under `com.personalplatform.sql.jooq.<schema>`.
- Git workflow: one branch per workstream in a git worktree; merge with git; commit locally; push only after the
  owner says so at a phase boundary.
- Downloads/installs on the owner's machine (Ollama, models, kind, k6) need an explicit yes at the time.

## 4. Approaches considered

**A. Gateway + platform token (chosen).** A Spring Cloud Gateway is the only public entrance. It authenticates the
caller (Firebase ID token, API key, or consent access token), exchanges that for a short-lived *platform token*
issued by `auth` that carries roles and permissions, meters the call, and forwards. Services verify the platform
token. Trade-offs: one more hop and one more service; in return, authorization is uniform, services stay simple,
and metering/rate limiting live in one place. This is how real PaaS front doors work.

**B. Library-only RBAC.** Each service calls `auth` (or a shared library reads the DB) to resolve permissions per
request. No gateway. Trade-offs: no single place to meter or rate limit, N services each depend on `auth` at
request time, and the story is weaker. Rejected.

**C. Service mesh (Istio/Linkerd) for authn/authz/metrics.** Heavy for a laptop, hides the interesting code,
and needs a real cluster. Rejected; Helm on kind in CI covers the Kubernetes story.

Frontend: **one `workspace` app hosting the products as modules (chosen)** versus micro-frontends (module
federation) or keeping seven apps. Modules keep one sign-in, one shell and one design language while reusing the
existing app code and tests; module federation adds build complexity with no portfolio payoff.

## 5. Architecture

```
 Browser ──► site (public, static)               workspace (React: products + developer + admin sections)
                                │
                                ▼   Bearer <Firebase ID token | API key | consent token>
                        ┌────────────────┐   usage events    ┌───────────┐   ┌──────────────────┐
                        │    gateway     ├──────────────────►│   Kafka   ├──►│ platform-service │──► Timescale
                        │ authn, exchange│                   │ (KRaft)   │   │ usage, plans,    │    platform schema
                        │ rate limit,    │◄─ quota/plan ─────┤           │   │ dev portal,      │
                        │ metering       │                   └───────────┘   │ webhooks, flags  │
                        └───────┬────────┘                                   └──────────────────┘
        platform token (RS256, roles+permissions+plan)
        ┌──────┬────────┬──────┴─┬──────────┬───────────┬──────────┬──────────┐
        ▼      ▼        ▼        ▼          ▼           ▼          ▼          ▼
      auth  shared  waiting-on consent  home-pulse  ask-your-life legacy   treasury     mcp-server   ml-service
     (IdP,   -svc     (Temporal) -gw    (Timescale)  (pgvector)           (ledger)    (tools for    (Python,
      RBAC,                                                                            AI agents)    forecasting)
      token
      exchange)
 observability: OpenTelemetry agent on every JVM → OTLP collector → Tempo/Prometheus/Loki → Grafana
```

### 5.1 New and changed modules
| Module | Kind | Purpose |
|---|---|---|
| `gateway` (:8080) | new, Spring Cloud Gateway | single entrance, authn, token exchange (cached), per-plan rate limit (Bucket4j, in-memory), quota check, usage event emit, request id, CORS |
| `auth` (:8081) | extend | RBAC tables, permission catalogue, token exchange endpoint, JWKS, admin user/role APIs, audit of role changes |
| `libs/platform-security` | extend | `app.security.mode=firebase\|platform`; platform-token decoder; `@RequiresPermission`; permission authorities; test support |
| `platform-service` (:8089) | new | usage consumer + analytics API, plans/quotas/entitlements, feature flags, developer portal (apps, API keys, webhooks, sandbox), connected apps view |
| `mcp-server` (:8090) | new | MCP tools over consent-scoped data for AI agents (Phase 3) |
| `ml-service` (:8091) | new, Python/FastAPI | trained forecasting/anomaly model for Home Pulse (Phase 4) |
| `ui-common/apps/site` | new | public marketing site |
| `ui-common/apps/workspace` | new | unified signed-in app: products as modules, Developer and Admin sections |
| `dev/` | extend | compose gains Kafka and the observability stack; `up.sh` starts gateway and platform-service |

### 5.2 Personas, permissions, enforcement
Personas: **OWNER**, **ADMIN** (operator/support), **DEVELOPER**, **MEMBER** (default for every new user),
**AUDITOR** (read only), plus non-human principals **API_KEY** and **CONSENT_CLIENT**, which carry scopes, not roles.
Existing `USER` maps to `MEMBER`; `ADMIN` stays `ADMIN`; emails in `BOOTSTRAP_ADMIN_EMAILS` become `OWNER`.

Permissions are `resource:action` strings:
`products:use`, `usage:read:self`, `usage:read:all`, `connections:manage` (own connected apps),
`apps:manage` (own developer apps), `apps:read:all`, `keys:manage`, `webhooks:manage`, `sandbox:use`, `logs:read:own`,
`workspaces:manage`, `users:read`, `users:write`, `roles:assign`, `roles:assign:privileged`, `plans:manage`, `flags:manage`,
`audit:read`, `support:impersonate`.

| Role | Permissions |
|---|---|
| MEMBER | `products:use`, `usage:read:self`, `connections:manage` |
| DEVELOPER | MEMBER + `apps:manage`, `keys:manage`, `webhooks:manage`, `sandbox:use`, `logs:read:own`, `workspaces:manage` |
| AUDITOR | `usage:read:all`, `users:read`, `audit:read`, `apps:read:all` |
| ADMIN | MEMBER + `users:read`, `users:write`, `roles:assign`, `usage:read:all`, `flags:manage`, `audit:read`, `apps:read:all`, `support:impersonate` |
| OWNER | every permission, including `roles:assign:privileged` (grant ADMIN/OWNER) and `plans:manage` |

Rules: deny by default; an ADMIN cannot grant ADMIN/OWNER or change an OWNER; the last OWNER cannot be removed;
every role change and every impersonation start is written to an append-only audit table; impersonation sessions are
time-boxed (<= 30 min), carry an `act` claim, are visible to the target user, and cannot reach `roles:*` or `plans:manage`.
Permissions live in Postgres (`auth.roles`, `auth.role_permissions`, `auth.user_roles`) and are versioned by a
`permissions_version` claim so cached tokens can be invalidated.

### 5.3 Platform token (contract)
`POST auth /v1/token/exchange` with `Authorization: Bearer <Firebase ID token>` returns
`{ "accessToken": "...", "expiresIn": 600 }`. Token: RS256, `kid` from `auth` JWKS at `/.well-known/jwks.json`,
`iss` = `app.platform.issuer` (default `http://localhost:8081`), `aud` = `trove-platform`, `token_use` = `platform`.
Claims: `sub` (Firebase uid), `uid` (internal user UUID), `email`, `name`, `roles[]`, `permissions[]`, `plan`,
`workspaces[]`, `pv` (permissions version), optional `act` (impersonator uid). Service principals get
`token_use` = `service`, `sub` = `app:<appId>`, `scopes[]` instead of roles. The gateway caches exchanges
(key = SHA-256 of the incoming credential, TTL <= 5 min, evicted on `pv` change) so `auth` is not hit per request.
Services run with `app.security.mode=platform` and `app.platform.jwk-set-uri`; the default stays `firebase`, so
all existing tests and standalone runs are unchanged.

### 5.4 Usage event (contract)
Kafka topic `platform.usage.v1`, key = principal id, JSON value:
`{ eventId, ts, requestId, principalType: USER|API_KEY|CONSENT_CLIENT|ANON, principalId, appId, service, method,
routeTemplate, status, latencyMs, requestBytes, responseBytes, plan, rateLimited }`.
`routeTemplate` is the matched route pattern (`/v1/items/{id}`), never the raw path, to bound cardinality and keep
ids out of analytics. `platform-service` consumes idempotently (insert on `eventId`) into
`platform.usage_events` (Timescale hypertable) with continuous aggregates at 1 minute, 1 hour and 1 day by
service, principal, status. A second topic `platform.audit.v1` carries role changes and impersonation events.

### 5.5 Quotas and rate limits
Plans: `FREE`, `PRO`, `DEVELOPER` in `platform.plans` (requests/minute, requests/month, API keys, webhooks).
Per-minute limits: Bucket4j in the gateway (single instance; Redis is explicitly out of scope). Monthly quotas:
gateway reads `platform-service GET /internal/v1/quota/{principalId}` (cached 30 s, backed by the daily aggregate).
Over limit: `429` with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` and an RFC 9457 problem body.

## 6. Phases and what each delivers
Details, tasks and status are in `docs/TRACKER.md`. Each phase ends verified (tests, clean-checkout build, tracker
updated, committed) before the next starts.

1. **Platform core.** RBAC and token exchange in `auth`, platform-token support in `platform-security`, gateway,
   Kafka, `platform-service` usage pipeline and owner analytics API, plans/quotas, dev stack and CI updated.
2. **Front door.** Design language, `site`, `workspace` shell with the products as modules, onboarding, persona-aware
   navigation, admin console (users, roles, flags, usage analytics, audit), Today home, command palette.
3. **Developer platform.** Developer apps (OAuth clients via consent), API keys, scopes catalog, signed webhooks with
   retries and delivery log, OpenAPI docs and generated SDK, playground, sandbox, connected-apps screen, MCP server.
4. **AI and ML.** Real RAG in Ask Your Life (local embeddings and LLM through Ollama, citations, streaming,
   evaluation harness), Trove Assistant over MCP tools, ML forecasting service for Home Pulse.
5. **Hardening and presence.** OpenTelemetry + Prometheus + Grafana, Helm chart and kind smoke test in CI, image
   build and Trivy scan, per-persona Playwright suite, k6 load results, OWASP ZAP baseline, threat model,
   decision records, free live demo, README with screenshots and diagrams.

## 7. What is left to the builder
Package names inside new modules; exact DDL; choice of `reactor-kafka` vs `spring-kafka` for the gateway producer
(default: `reactor-kafka`); component-level visual design inside the approved direction; OpenTelemetry collector
wiring. Defaults chosen by me, not by the owner: Bucket4j in memory (no Redis), `apache/kafka` image in KRaft mode,
Grafana LGTM-style local stack, Playwright for end-to-end tests, k6 for load tests.
