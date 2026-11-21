# Phase 1: Platform Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Progress is mirrored in `docs/TRACKER.md`.

**Goal:** Put a gateway in front of every service, give every request a platform token carrying roles and permissions, meter every call into Kafka and Timescale, enforce plans and rate limits, and give the owner usage analytics.

**Architecture:** `auth` becomes the platform identity provider: it exchanges a Firebase ID token for a short-lived RS256 platform token (roles, permissions, plan). `gateway` (Spring Cloud Gateway) authenticates callers, exchanges and caches tokens, checks route permissions, rate limits, and emits usage events to Kafka. `platform-service` consumes the events into a Timescale hypertable and serves plans, quotas and analytics. Services opt into `app.security.mode=platform` to verify platform tokens; the default stays `firebase`, so every existing test is unchanged.

**Tech Stack:** Java 21, Spring Boot 4.1.2, Spring Cloud 2026.0.0 (Gateway Server WebFlux 5.1.x), reactor-kafka 1.3.25, spring-kafka (managed by Boot), Bucket4j (`bucket4j_jdk17-core`), jOOQ 3.21.9, Flyway, TimescaleDB 2.32 (`timescale/timescaledb:2.32.0-pg16` in tests), Kafka KRaft (`apache/kafka`), Testcontainers.

**Spec:** `docs/superpowers/specs/2026-11-21-trove-platform-v2-design.md` (sections 5.1 to 5.5 are the contracts; read them first).

## Global Constraints

- Existing suites stay green: backend 745 tests (`./mvnw verify`), frontend 1,188 (`pnpm test`). Default `app.security.mode=firebase` must leave every current service test untouched.
- Tests that need Docker: `export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`.
- Conventions: UUIDv7 ids (`com.personalplatform.sql.UuidV7`), migrations in `sql-jooq/src/main/resources/db/migration/<schema>/`, SQL the jOOQ parser cannot read in `<schema>_ext/` at versions >= 100, generated classes under `com.personalplatform.sql.jooq.<schema>`, RFC 9457 problem bodies for errors, no secrets in git.
- Personas: OWNER, ADMIN, DEVELOPER, MEMBER, AUDITOR. Permission strings and the role matrix are exactly those in design section 5.2. Legacy `USER` role becomes `MEMBER`.
- Platform token: RS256, `aud` = `trove-platform`, `token_use` = `platform`, TTL 600 s, claims `sub, uid, email, name, roles[], permissions[], plan, workspaces[], pv, act?`. Exchange endpoint `POST /v1/token/exchange`; JWKS at `/.well-known/jwks.json`.
- Usage event: topic `platform.usage.v1`, key = principal id, fields exactly as design section 5.4; `routeTemplate` never the raw path.
- Plans (seed values): FREE 120 req/min, 10,000 req/month, 3 API keys, 1 webhook; PRO 600, 200,000, 10, 5; DEVELOPER 1,200, 1,000,000, 50, 20.
- Ports: gateway 8080, auth 8081, platform-service 8089. Gateway public paths: `/api/{service}/**` with service in `auth, shared, waiting-on, consent, home-pulse, ask-your-life, digital-legacy, family-treasury, platform`; the prefix `/api/{service}` is stripped before proxying.
- Package roots: `com.personalplatform.gateway`, `com.personalplatform.platform`.
- Parallel workstreams run in separate git worktrees on branches `phase-1/<workstream>`; never edit files owned by another workstream.

## Review Focus

Inputs the spec implies but a straight reading of the tasks would not test, most likely first:

1. A suspended user holding a valid Firebase token: exchange returns 403 and the gateway never forwards (Task 2, Task 6).
2. The same `eventId` delivered twice by Kafka produces exactly one row (Task 9).
3. Kafka down or slow: requests still succeed and are not delayed by metering (Task 8).
4. The last OWNER cannot be demoted or removed, and an ADMIN cannot grant ADMIN or OWNER (Task 3).
5. A forged platform token (`alg: none`, wrong `kid`, wrong `aud`, expired) is rejected by a service in platform mode (Task 4).

## File Structure

| Path | Responsibility | Task |
|---|---|---|
| `pom.xml`, `sql-jooq/pom.xml` | register `gateway`, `platform-service`, `platform` schema codegen | 0 |
| `gateway/**` | Spring Cloud Gateway app | 0, 6, 7, 8 |
| `platform-service/**` | usage, plans, quota, analytics | 0, 9, 10, 11 |
| `sql-jooq/src/main/resources/db/migration/auth/V2..V4*.sql` | RBAC, suspension, plan, audit, signing keys | 1, 2, 3 |
| `sql-jooq/src/main/resources/db/migration/platform/`, `platform_ext/` | usage and plans schema | 9 |
| `auth/src/main/java/com/personalplatform/auth/rbac/**` | roles, permissions, repository | 1 |
| `auth/src/main/java/com/personalplatform/auth/token/**` | signing keys, issuer, exchange, JWKS | 2 |
| `auth/src/main/java/com/personalplatform/auth/admin/**` | admin user/role/plan/audit APIs | 3 |
| `libs/platform-security/**` | platform mode, `@RequiresPermission`, mode-aware decoder factory, test helper | 4, 5 |
| `dev/docker-compose.yml`, `dev/up.sh`, `dev/e2e-phase1.sh`, app `.env.local` | local stack and proof | 12, 13 |

## Pre-wiring (Task 0, done by the coordinator before any parallel work)

### Task 0: Skeleton modules, schema registration, Kafka in compose

**Files:** Modify `pom.xml`, `sql-jooq/pom.xml`, `dev/docker-compose.yml`; Create `gateway/pom.xml`, `gateway/src/main/java/com/personalplatform/gateway/GatewayApplication.java`, `gateway/src/main/resources/application.yml`, `platform-service/pom.xml`, `platform-service/src/main/java/com/personalplatform/platform/PlatformServiceApplication.java`, `platform-service/src/main/resources/application.properties`, `sql-jooq/src/main/resources/db/migration/platform/V1__platform_schema.sql` (schema only).

**Produces:** a reactor that builds with both new modules; a `generate-platform` jOOQ execution (package `com.personalplatform.sql.jooq.platform`); Kafka reachable at `localhost:9092`.

- [ ] **Step 1:** Add `gateway` and `platform-service` to the root `<modules>`; import `org.springframework.cloud:spring-cloud-dependencies:2026.0.0` only inside `gateway/pom.xml`. If that BOM does not resolve against Boot 4.1.2, stop and report; fallback is a WebFlux-based custom gateway with the same behaviour.
- [ ] **Step 2:** `gateway` depends on `spring-cloud-starter-gateway-server-webflux`, `spring-boot-starter-actuator`, `spring-boot-starter-oauth2-resource-server`, `io.projectreactor.kafka:reactor-kafka`, `com.bucket4j:bucket4j_jdk17-core`; `platform-service` depends on `platform-sql`, `platform-security`, `spring-boot-starter-webmvc`, `spring-boot-starter-jooq`, `spring-boot-starter-flyway`, `spring-kafka`, `postgresql`, test deps with Testcontainers (postgresql, kafka). Mirror an existing service pom (`family-treasury/pom.xml`) for versions and plugins.
- [ ] **Step 3:** In `sql-jooq/pom.xml` copy the `generate-treasury` execution as `generate-platform` (scripts `db/migration/platform/*.sql`, package `com.personalplatform.sql.jooq.platform`, directory `target/generated-sources/jooq/platform`) and add that directory to the build-helper sources.
- [ ] **Step 4:** Add a `kafka` service to `dev/docker-compose.yml` (`apache/kafka`, KRaft single node, `9092:9092`, advertised listener `localhost:9092`, topic auto-create on).
- [ ] **Step 5:** Verify: `./mvnw -q -DskipTests package` succeeds for the whole reactor; `docker compose -f dev/docker-compose.yml up -d kafka` starts it.
- [ ] **Step 6:** Commit `chore: scaffold gateway, platform-service, platform schema and Kafka`.

## Workstream A: identity and authorization (`auth`, `libs/platform-security`)

### Task 1: RBAC model and personas in `auth`

**Files:** Create `sql-jooq/.../auth/V2__rbac.sql`, `auth/src/main/java/com/personalplatform/auth/rbac/{Permission.java,Persona.java,RbacRepository.java,RbacService.java}`; Modify `auth/.../user/{AuthUser.java,UserService.java,UserRepository.java}`, `auth/.../config/SecurityConfig.java`; Test `auth/src/test/java/com/personalplatform/auth/rbac/RbacTest.java`.

**Interfaces:**
- Produces: `enum Persona { OWNER, ADMIN, DEVELOPER, MEMBER, AUDITOR }`; `record AuthUser(UUID id, String firebaseUid, String email, String displayName, Set<String> roles, Set<String> permissions, String plan, boolean suspended)`; `Set<String> RbacService.permissionsFor(Set<String> roles)`; `UserService.resolve(Jwt)` returns a user with permissions filled. Spring authorities: `ROLE_<role>` and `<permission>` strings.

- [ ] **Step 1: failing test** `RbacTest.roleMatrixMatchesDesign` asserts, for each persona, the exact permission set in design section 5.2 (OWNER has every permission; MEMBER has exactly `products:use, usage:read:self, connections:manage`).
- [ ] **Step 2:** run `./mvnw -pl auth -am test -Dtest=RbacTest` and see it fail.
- [ ] **Step 3:** Migration `V2__rbac.sql`: `auth.permissions(name pk, description)`, `auth.role_permissions(role_name fk, permission_name fk, pk both)`, add roles OWNER/DEVELOPER/MEMBER/AUDITOR, move existing `USER` grants to `MEMBER` and delete the `USER` role, add `auth.users.suspended_at timestamptz null` and `auth.users.plan varchar(32) not null default 'FREE'`, add `auth.users.permissions_version int not null default 1`. Seed permissions and the matrix from design 5.2.
- [ ] **Step 4:** Implement `RbacService`/`RbacRepository` (cache permissions per role in memory, reload on admin change) and update `UserService`: new users get `MEMBER`; emails in `app.auth.bootstrap-admin-emails` become `OWNER` (verified email only, as today); `SecurityConfig` builds authorities from roles and permissions; `/v1/admin/**` requires `users:read` for GET and `users:write` for writes (Task 3 refines).
- [ ] **Step 5:** Update existing `AuthServiceApplicationTests` expectations from `USER` to `MEMBER` and `ADMIN` bootstrap to `OWNER`; run the full auth suite; all green.
- [ ] **Step 6:** Commit `feat(auth): RBAC with personas and permissions`.

### Task 2: Platform token issuer, exchange endpoint, JWKS

**Files:** Create `sql-jooq/.../auth/V3__signing_keys.sql`, `auth/.../token/{SigningKeyService.java,PlatformTokenIssuer.java,TokenController.java,JwksController.java}`; Modify `auth/.../config/{AppProperties.java,SecurityConfig.java}`, `auth/src/main/resources/application.properties`; Test `auth/.../token/TokenExchangeTest.java`.

**Interfaces:**
- Consumes: `AuthUser` from Task 1.
- Produces: `POST /v1/token/exchange` (Firebase bearer) returning `{"accessToken": String, "expiresIn": 600, "tokenType": "Bearer"}`; `GET /.well-known/jwks.json` (public); `PlatformTokenIssuer.issue(AuthUser user, Optional<String> actorUid): String`; properties `app.platform.issuer` (default `http://localhost:8081`), `app.platform.key-encryption-key` (base64 of 32 bytes, required, no default outside a `dev` profile).

- [ ] **Step 1: failing tests** in `TokenExchangeTest`: (a) exchange returns a token whose signature verifies against the JWKS and whose claims equal the user's roles/permissions/plan and `aud`, `iss`, `token_use`, 600 s expiry; (b) a **suspended user gets 403** with a problem body and no token (Review Focus 1); (c) after key rotation an old token still verifies and new tokens use the new `kid`; (d) the JWKS exposes only public parameters.
- [ ] **Step 2:** run and see failures.
- [ ] **Step 3:** `SigningKeyService`: RSA 2048 keys in `auth.signing_keys` (private key AES-GCM encrypted with the KEK), one ACTIVE key, rotation keeps the previous key for verification only; create the first key on startup if none exists. `PlatformTokenIssuer` builds and signs with Nimbus JOSE. `TokenController` resolves the user via `UserService.resolve`, rejects suspended users with 403, increments nothing else.
- [ ] **Step 4:** run tests, all green; run the full auth suite.
- [ ] **Step 5:** Commit `feat(auth): platform token exchange and JWKS`.

### Task 3: Admin APIs, guardrails, audit

**Files:** Create `sql-jooq/.../auth/V4__audit_log.sql`, `auth/.../admin/{AdminUserController.java (replace), AdminRoleController.java, AdminAuditController.java, AuditRepository.java}`; Test `auth/.../admin/AdminApiTest.java`.

**Interfaces:**
- Produces (all under `/v1/admin`, JSON, paged `?page&size`): `GET /users?q=`, `GET /users/{id}`, `PUT|DELETE /users/{id}/roles/{role}`, `POST /users/{id}/suspend`, `POST /users/{id}/restore`, `PUT /users/{id}/plan/{plan}` (permission `plans:manage`, plan in FREE, PRO, DEVELOPER), `GET /roles` (roles with permissions), `GET /audit` (permission `audit:read`). Every mutation increments `auth.users.permissions_version` and appends to `auth.audit_log(id, at, actor_id, action, target_id, detail jsonb)` (append-only: reject UPDATE/DELETE with a trigger in `auth_ext` at version >= 100).

- [ ] **Step 1: failing tests** in `AdminApiTest`: persona × endpoint matrix (MEMBER 403 everywhere; AUDITOR can GET users and audit but not write; ADMIN can assign MEMBER/DEVELOPER/AUDITOR; only OWNER can assign or revoke ADMIN/OWNER and change plans); **an ADMIN cannot grant ADMIN or OWNER and cannot touch an OWNER; the last OWNER cannot be revoked or suspended** (Review Focus 4); suspend then exchange gives 403; each mutation writes one audit row; audit rows cannot be updated.
- [ ] **Step 2:** run and see failures.
- [ ] **Step 3:** Implement with `@RequiresPermission`-style checks via method security (use the Spring authorities from Task 1 until Task 4 lands; switch to the annotation after merge if trivial).
- [ ] **Step 4:** run tests, all green; full auth suite.
- [ ] **Step 5:** Commit `feat(auth): admin APIs with guardrails and audit trail`.

### Task 4: `platform-security` platform mode and `@RequiresPermission`

**Files:** Create `libs/platform-security/src/main/java/com/personalplatform/security/{SecurityMode.java,PlatformProperties.java,PlatformJwtDecoderFactory.java,PermissionAuthoritiesConverter.java,RequiresPermission.java,IdentityDecoderFactory.java}`, `libs/platform-security/src/test/java/.../PlatformSecurityTest.java`, a test-support class `PlatformTokens` under `src/testFixtures` or `src/test` exported for services; Modify `PlatformSecurityAutoConfiguration.java`.

**Interfaces:**
- Produces: property `app.security.mode` = `firebase` (default) | `platform`; `app.platform.jwk-set-uri`, `app.platform.issuer`; `@RequiresPermission(String)` (method security, 403 when the authority is absent); `IdentityDecoderFactory.create(Environment-bound props): JwtDecoder` returning the Firebase decoder or the platform decoder by mode; authorities = `ROLE_<role>` for each `roles[]` claim plus each `permissions[]` string.

- [ ] **Step 1: failing tests** in `PlatformSecurityTest`: valid platform token accepted; **forged tokens rejected**: `alg: none`, signed by an unknown key, wrong `aud`, wrong `iss`, expired (Review Focus 5); an endpoint with `@RequiresPermission("usage:read:all")` returns 403 without it and 200 with it; default mode `firebase` still builds the Firebase decoder.
- [ ] **Step 2:** run and see failures.
- [ ] **Step 3:** Implement `PlatformJwtDecoderFactory` with `NimbusJwtDecoder.withJwkSetUri(...)`, validators for issuer, `aud` = `trove-platform`, `token_use` = `platform` or `service`, expiry; `PermissionAuthoritiesConverter` as the `JwtAuthenticationConverter` source; enable method security in the auto-configuration only when the annotation is used.
- [ ] **Step 4:** run tests, all green.
- [ ] **Step 5:** Commit `feat(security): platform token mode and @RequiresPermission`.

### Task 5: Mode-aware decoder in services that build their own

**Files:** Modify every service that calls `FirebaseJwtDecoderFactory.create` directly (find with `grep -rn FirebaseJwtDecoderFactory --include=*.java */src/main`; at least `consent-gateway/.../SecurityConfig.java`).

**Interfaces:** Consumes `IdentityDecoderFactory` from Task 4.

- [ ] **Step 1:** In each such service replace the direct call with `IdentityDecoderFactory.create(...)`, leaving its chain and qualifiers as they are. Device-token, webhook-secret and consent-token chains stay untouched.
- [ ] **Step 2:** Run each touched service's full test suite; all green and unchanged in count.
- [ ] **Step 3:** Commit `refactor: services use the mode-aware identity decoder`.

## Workstream B: gateway (`gateway`)

### Task 6: Routing, credential handling, exchange with cache, route permissions

**Files:** Create `gateway/src/main/java/com/personalplatform/gateway/{config/GatewayProperties.java, security/ExchangeFilter.java, security/ExchangeClient.java, security/ExchangeCache.java, security/PassthroughMatcher.java, RequestIdFilter.java, CorsConfig.java}`, `gateway/src/test/java/.../{ExchangeFilterTest.java,RoutingTest.java}`; Modify `gateway/src/main/resources/application.yml`.

**Interfaces:**
- Consumes: `POST {auth}/v1/token/exchange` and the claims contract (Global Constraints). Tests use a stub exchange server (MockWebServer or WireMock), not the real `auth`.
- Produces: routes `/api/{service}/**` (StripPrefix=2) for the nine services with base URIs from properties (`gateway.services.<name>.uri`); header `X-Request-Id` set if absent and forwarded; for authenticated routes the downstream `Authorization` is replaced by `Bearer <platform token>`; `gateway.routes.<name>.required-permission` (default `products:use` for the six product routes, none for `auth`, `shared`, `platform`); passthrough patterns (no exchange, header forwarded untouched) configured in `gateway.passthrough` and verified against the controllers: Home Pulse device ingest, Waiting On inbound webhook, Consent Gateway OAuth/token and gateway-token endpoints, shared-service signed file downloads.

- [ ] **Step 1: failing tests:** valid Firebase-style token is exchanged and the downstream stub receives the platform token and an `X-Request-Id`; missing token on an authenticated route gives 401 problem body; exchange 403 (suspended) gives 403 and **nothing is forwarded** (Review Focus 1); token without `products:use` on a product route gives 403; a passthrough path is forwarded unchanged; two requests with the same credential within 60 s call the exchange once, a third after expiry calls it again; CORS preflight from `http://localhost:5181` succeeds and from `http://evil.example` does not.
- [ ] **Step 2:** run and see failures.
- [ ] **Step 3:** Implement with a global filter ordered before routing; `ExchangeCache` keyed by SHA-256 of the credential, TTL 60 s, bounded size; never log credentials.
- [ ] **Step 4:** run tests, all green.
- [ ] **Step 5:** Commit `feat(gateway): routing, token exchange and route permissions`.

### Task 7: Rate limiting and monthly quota

**Files:** Create `gateway/.../ratelimit/{RateLimitFilter.java, PlanLimits.java, QuotaClient.java}`, test `gateway/.../ratelimit/RateLimitTest.java`.

**Interfaces:**
- Consumes: `GET {platform-service}/internal/v1/plans` returning `[{"plan","requestsPerMinute","requestsPerMonth"}]` and `GET /internal/v1/quota/{principalId}` returning `{"plan","monthlyLimit","used"}`, both with header `X-Internal-Key`. Fail open if platform-service is unreachable (use the seed values in Global Constraints for plans; skip the monthly check).
- Produces: a filter after the exchange filter: Bucket4j bucket per principal id sized by the plan in the token; anonymous or passthrough requests are limited per client IP from the connection, **not** from `X-Forwarded-For`; over limit gives 429 with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` and a problem body; monthly quota exceeded gives 429 with a distinct problem `type`.

- [ ] **Step 1: failing tests:** FREE principal is limited after 120 requests in a minute while a PRO principal is not; a different principal is unaffected; spoofed `X-Forwarded-For` does not reset an anonymous limit; monthly quota exceeded returns the quota problem type; platform-service down does not block requests.
- [ ] **Step 2:** run and see failures; **Step 3:** implement; **Step 4:** run green.
- [ ] **Step 5:** Commit `feat(gateway): per-plan rate limits and monthly quota`.

### Task 8: Usage events to Kafka

**Files:** Create `gateway/.../metering/{UsageEvent.java, UsageEventFilter.java, UsagePublisher.java}`, test `gateway/.../metering/UsageMeteringTest.java`.

**Interfaces:** Produces an event per proxied request (including 401/403/429 outcomes) on topic `platform.usage.v1`, key = principal id (or `anon:<hash of client IP>`), JSON exactly per design 5.4, written after the response completes. `routeTemplate` comes from the matched route and the downstream path pattern when known, otherwise the first two path segments after `/api/{service}`.

- [ ] **Step 1: failing tests** with Testcontainers Kafka: one event per request with the right fields; 429 and 403 are recorded; `routeTemplate` never contains an id; **with Kafka stopped, requests still return their normal response and add no measurable delay (p99 added latency under 50 ms in the test) and a drop counter increments** (Review Focus 3).
- [ ] **Step 2:** run and see failures; **Step 3:** implement with `reactor-kafka` `KafkaSender` using fire-and-forget `send` on a bounded buffer that drops oldest and counts drops (Micrometer counter `gateway.usage.dropped`); **Step 4:** run green.
- [ ] **Step 5:** Commit `feat(gateway): usage metering to Kafka`.

## Workstream C: usage and plans (`platform-service`, `platform` schema)

### Task 9: Schema, idempotent consumer

**Files:** Create `sql-jooq/.../platform/V2__usage_and_plans.sql` (plain tables: `platform.plans`, `platform.usage_events_dedupe` if needed), `sql-jooq/.../platform_ext/V100__usage_hypertable.sql` (hypertable `platform.usage_events` partitioned by `ts`, indexes, continuous aggregates `usage_1m`, `usage_1h`, `usage_1d` by service, principal, status class, latency buckets, plus retention policy 90 days raw), `sql-jooq/src/test/java/com/personalplatform/sql/PlatformSchemaTest.java`, `platform-service/.../usage/{UsageEvent.java, UsageConsumer.java, UsageRepository.java}`, test `platform-service/.../UsageConsumerTest.java`.

**Interfaces:** Consumes topic `platform.usage.v1` (JSON per design 5.4). Produces `platform.usage_events(event_id uuid, ts timestamptz, ...)` with a unique key on `(event_id, ts)`; `UsageRepository.insertIdempotent(UsageEvent): boolean`.

- [ ] **Step 1: failing tests:** schema test (migrations apply on the Timescale image; hypertable and three aggregates exist); consumer test with Testcontainers Kafka and Timescale: an event becomes a row; **the same `eventId` published twice leaves one row** (Review Focus 2); a malformed event goes to a dead-letter topic `platform.usage.v1.dlq` and does not stop consumption.
- [ ] **Step 2:** run and see failures; **Step 3:** implement (`spring-kafka` listener, manual ack after the insert commits, `ON CONFLICT DO NOTHING`); **Step 4:** run green.
- [ ] **Step 5:** Commit `feat(platform): usage hypertable and idempotent consumer`.

### Task 10: Plans, quota and internal API

**Files:** Create `platform-service/.../plans/{PlanController.java, QuotaService.java}`, `platform-service/.../config/InternalApiKeyFilter.java`, test `platform-service/.../plans/QuotaTest.java`; seed plans in `V2__usage_and_plans.sql`.

**Interfaces:** Produces `GET /internal/v1/plans` and `GET /internal/v1/quota/{principalId}` exactly as the gateway consumes them (Task 7); both require header `X-Internal-Key` equal to `app.internal.api-key`, otherwise 401; `used` counts this calendar month (UTC) from the daily aggregate plus today's raw rows.

- [ ] **Step 1: failing tests:** seed values equal Global Constraints; quota `used` reflects inserted events across a month boundary; missing or wrong key gives 401.
- [ ] **Step 2:** run and see failures; **Step 3:** implement; **Step 4:** run green.
- [ ] **Step 5:** Commit `feat(platform): plans and quota API`.

### Task 11: Analytics API

**Files:** Create `platform-service/.../analytics/{AnalyticsController.java, AnalyticsRepository.java, Dtos.java}`, test `platform-service/.../analytics/AnalyticsTest.java`.

**Interfaces:** Produces (platform-token authenticated, `@RequiresPermission`): `GET /v1/usage/summary?from&to&service&principalId` (`usage:read:all`), `GET /v1/usage/top-users?from&to&limit` (`usage:read:all`), `GET /v1/usage/me?from&to` (`usage:read:self`, always scoped to the caller's `uid`, ignoring any `principalId` parameter). Summary body: `{ totalRequests, errorRate, p50Ms, p95Ms, activeUsers, byService:[{service,requests,errors}], byStatusClass:{"2xx":n,...}, series:[{ts,requests,errors}] }`. Resolution picks `usage_1m`, `usage_1h` or `usage_1d` by range; percentiles are computed from stored latency bucket counts (no Timescale toolkit).

- [ ] **Step 1: failing tests:** persona matrix (MEMBER gets 403 on `summary` and `top-users`, 200 on `me`; ADMIN, AUDITOR and OWNER get 200 on all); `me` never leaks another principal even with `principalId` set; known events produce exact totals, error rate and a p95 within one bucket width; range selects the expected aggregate.
- [ ] **Step 2:** run and see failures; **Step 3:** implement; **Step 4:** run green; run the `platform-service` suite.
- [ ] **Step 5:** Commit `feat(platform): usage analytics API`.

## Integration (coordinator)

### Task 12: Dev stack, proxies, CI

**Files:** Modify `dev/up.sh` (start `gateway` and `platform-service`; export `app.security.mode=platform`, `APP_PLATFORM_JWK_SET_URI=http://localhost:8081/.well-known/jwks.json`, `APP_PLATFORM_KEY_ENCRYPTION_KEY`, `APP_INTERNAL_API_KEY` from `dev/.state`), `dev/README.md`, each `ui-common/apps/*/.env.local` and `.env.example` (`VITE_API_BASE_URL=http://localhost:8080/api/<service>`; hub uses the base `http://localhost:8080/api`), `.github/workflows/ci.yml` only if new modules need extra steps.

- [ ] **Step 1:** Wire and start the stack: `dev/up.sh`; all ten services plus the gateway report healthy.
- [ ] **Step 2:** Update frontend env so each app talks to the gateway; run `pnpm lint typecheck test` (unchanged counts).
- [ ] **Step 3:** Commit `chore(dev): run the stack behind the gateway`.

### Task 13: End-to-end proof and phase close

**Files:** Create `dev/e2e-phase1.sh`; Modify `docs/TRACKER.md`, `README.md`.

- [ ] **Step 1:** `dev/e2e-phase1.sh` (curl against `localhost:8080`, dev identity provider tokens) asserts: a new user is MEMBER and can call a product route; the same user gets 403 on `/api/platform/v1/usage/summary` and on `/api/auth/v1/admin/users`; the bootstrap OWNER gets 200 on both; after the OWNER grants ADMIN to the member (via the admin API) and the 60 s cache window passes, the member gets 200 on the summary; a suspended user gets 403 at the gateway; a burst of 130 requests as a FREE user yields at least one 429; usage rows for these calls exist in Postgres within 15 s; a forged token gets 401.
- [ ] **Step 2:** Run it; paste its output into the tracker notes.
- [ ] **Step 3:** Full `./mvnw verify` (count must be >= 745 plus the new tests) and the frontend checks; clean-checkout build of tracked files.
- [ ] **Step 4:** Update `docs/TRACKER.md` (tick Phase 1), `README.md` architecture section, secret scan, commit `feat: phase 1 platform core`. Ask the owner before pushing.

## Execution

Four agents in parallel worktrees after Task 0: **A-auth** (Tasks 1 to 3), **A-lib** (Tasks 4 and 5), **B** (Tasks 6 to 8), **C** (Tasks 9 to 11). The coordinator merges the branches into `main`, then does Tasks 12 and 13.
