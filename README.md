# My-Trove

**A platform for the paperwork of life, built as one shared foundation and six products.**

Two Spring Boot foundations (authentication, and a shared service for households, reminders, files and audit) carry six
products that each lean on a different piece of heavy infrastructure: durable workflows, a tamper-evident access
gateway, time-series anomaly detection, private hybrid search, threshold cryptography, and a double-entry ledger.
Everything shares one Firebase sign-in, one PostgreSQL database (a schema per service), one design system and one
frontend monorepo.

Java 21 · Spring Boot 4.1 · Spring Cloud Gateway · Kafka · jOOQ · Flyway · PostgreSQL 16 · TimescaleDB · pgvector · Temporal · Firebase Auth · React 19 ·
TypeScript · Vite · TanStack Query · Vitest

## The products

| Product | What it does | The hard part |
|---|---|---|
| **Waiting On** | Tracks what you are owed (refunds, claims, approvals) and chases it for you, with draft letters. | Durable follow-up schedules as **Temporal** workflows; replies parsed from a per-item address; time-skipping tests run weeks of schedule in milliseconds. |
| **Consent** | "Me as an API": apps ask for scoped, revocable access to parts of your data. | Its own OAuth-style token issuer (RS256, JWKS, key rotation, encrypted keys), a policy engine, and a **hash-chained audit log** you can verify. |
| **Home Pulse** | Watches appliance power draw and flags when something looks off. | **TimescaleDB** hypertables and continuous aggregates, MAD-based anomaly detection with a learned baseline, HTTP and MQTT ingestion. |
| **Ask Your Life** | One private search over your notes, receipts and documents. | **pgvector** plus full-text search fused with reciprocal rank fusion; per-user isolation enforced by **row-level security**. |
| **Digital Legacy** | A dead-man's switch that hands a vault to trusted people if you stop checking in. | **Shamir secret sharing** over GF(256), client-side WebCrypto encryption (the server never sees plaintext), a check-in state machine. |
| **Family Treasury** | A shared household ledger with approvals and allowances. Bookkeeping only; no money moves. | **Double-entry** ledger with invariants enforced in the database, idempotency keys, a CQRS balance projection and reconciliation. |

## Repository layout

```
├── pom.xml                  Maven parent + aggregator (build everything: ./mvnw verify)
├── sql-jooq/                Flyway migrations (one folder per schema), generated jOOQ classes, UUIDv7, slow-query log
├── libs/platform-security/  Firebase ID-token verification + secure-by-default filter chain
├── gateway/                 The single public entrance: authn, token exchange, permissions, rate limits, usage metering :8080
├── auth/                    Identity provider: RBAC personas, platform tokens (JWKS), admin APIs, audit  :8081
├── platform-service/        Usage analytics (Kafka → Timescale), plans, quotas                          :8089
├── shared-service/          Households, reminders/notifications, files, audit                   :8082
├── waiting-on/              Durable follow-ups (Temporal)                                       :8083
├── consent-gateway/         Scoped, revocable data access + tamper-evident log                  :8084
├── home-pulse/              Appliance telemetry + anomaly detection (TimescaleDB, MQTT)          :8085
├── ask-your-life/           Private hybrid search (pgvector + full-text, RRF, RLS)               :8086
├── digital-legacy/          Dead-man's switch, Shamir secret sharing, end-to-end encrypted       :8087
├── family-treasury/         Double-entry household ledger                                        :8088
├── ui-common/               Frontend monorepo: tokens, UI kit, auth-web, api-client, gallery + 7 web apps (:5181-5187)
├── dev/                     Local stack: compose (Postgres+Timescale+pgvector, Temporal), dev identity provider, scripts
└── docs/handoffs/           Integration notes written while each service and app was built
```

Each service has its own `README.md` covering architecture, endpoints, configuration and its honest limitations.
Each service owns one Postgres schema; its migrations live in `sql-jooq/src/main/resources/db/migration/<schema>/`
(`<schema>_ext/` holds SQL the jOOQ generator cannot parse: extensions, triggers, policies; versions >= 100).
Java packages are `com.personalplatform.*` and frontend packages are `@platform/*`; those names predate "My-Trove".

## Quick start

Needs Docker, Java 21, Node 22+ and pnpm. Everything runs locally against real services with no Firebase account:

```bash
docker compose -f dev/docker-compose.yml up -d     # Postgres (+TimescaleDB, pgvector) and Temporal
./mvnw -DskipTests package                         # build the service jars
dev/up.sh                                          # local identity provider + all eight services
cd ui-common && pnpm install && cd .. && dev/web.sh                 # workspace http://localhost:5190, public site http://localhost:5191
```

Open the workspace and click "Continue with Google": you are signed in as the local owner (`dev@example.test`); typing any other email under "Email me a sign-in link" signs you in as a separate, ordinary member, which is how to see the persona-aware navigation. `dev/e2e-phase1.sh` then proves the platform layer end to end (33 checks). Every app also has a zero-setup demo mode
(stub sign-in and an in-memory mock API): run any app without a `.env.local`. Details, ports and how sign-in works:
[`dev/README.md`](dev/README.md). To use a real Firebase project instead: [`dev/FIREBASE.md`](dev/FIREBASE.md).

## Build and test

Backend tests use Testcontainers, so Docker must be running:

```bash
./mvnw clean verify                # all modules: 1,027 tests against real Postgres, Timescale, pgvector and Kafka containers
./mvnw -pl waiting-on -am verify   # one service plus what it needs
```

Frontend: `cd ui-common && pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` (1,188 tests).
CI runs both on every push (`.github/workflows/ci.yml`).

## Status

Every service is a verified first vertical slice, not a finished product. All tests pass against real databases, and
all seven web apps have been driven end to end against the real services. Sign-in has been verified with a real
Firebase project (Google, and email link on the hub).

Known gaps: notification delivery is log-only (no email/SMS/push provider), MQTT ingestion is off by default, the
embedder in Ask Your Life is a deterministic local one so semantic search is approximate, nothing has run against real
devices, and there is no production deployment yet.
