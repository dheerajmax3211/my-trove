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
├── deploy/                  Container images, Helm chart, single-host Compose, kind smoke test, ZAP rules
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
./mvnw clean verify                # all modules: 1,325 tests against real Postgres, Timescale, pgvector and Kafka containers
./mvnw -pl waiting-on -am verify   # one service plus what it needs
```

Frontend: `cd ui-common && pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` (2,240 tests).
CI runs both on every push (`.github/workflows/ci.yml`). A second workflow (`release.yml`) builds an image per service
and web app, scans each with Trivy, writes a CycloneDX SBOM, installs the Helm chart on a kind cluster, smoke-tests it
through the gateway, runs an OWASP ZAP baseline, and pushes the images to GHCR from `main`.

## Deploy

Two supported ways, both documented in [`docs/deploy.md`](docs/deploy.md):

- **One machine** with Docker Compose (`deploy/compose/`): every image plus PostgreSQL, Kafka and Temporal. The
  cheapest real install.
- **Kubernetes** with the Helm chart (`deploy/helm/my-trove`): hardened pods (non-root, read-only root filesystem, no
  capabilities), default-deny NetworkPolicy, probes on a private management port, Secrets kept outside the chart.

Security notes: [`docs/security/threat-model.md`](docs/security/threat-model.md). Design decisions:
[`docs/adr/`](docs/adr/README.md). Load baseline: [`docs/perf/2026-11-23-baseline.md`](docs/perf/2026-11-23-baseline.md).

## Status

Every service is a verified first vertical slice, not a finished product. All tests pass against real databases, and
the workspace has been driven end to end against the real services. Sign-in has been verified with a real Firebase
project (Google, and email link).

Deployment readiness: images, the Helm chart and the Compose install exist and are tested locally (the Compose
install of the real images passes the end-to-end scripts through the gateway). The kind smoke test, ZAP baseline and
image push run in GitHub Actions and have not run yet. Nothing is deployed publicly. Details in `docs/deploy.md`.

Known gaps: email goes to Mailpit in dev and needs an SMTP relay in production; MQTT ingestion is off by default; Ask
Your Life uses a deterministic local embedder unless `EMBEDDER_URL` points at a real one, so semantic search is
approximate; nothing has run against real devices; rate limits are per gateway replica.
