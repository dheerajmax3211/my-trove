# Resume bullets

Every number below comes from this repository: the test suites, `docs/perf/2026-11-23-baseline.md`, the end-to-end
scripts in `dev/`, and the reports in `docs/superpowers/briefs/`. Pick three to five; each stands alone.

**My-Trove**, a self-hosted personal-data platform (Java 21, Spring Boot 4, Spring Cloud Gateway, Kafka, Temporal,
PostgreSQL/TimescaleDB/pgvector, React 19, TypeScript, Kubernetes)

- Designed and built an 11-service backend behind a single Spring Cloud Gateway that exchanges Firebase sign-ins for
  short-lived RS256 platform tokens carrying roles and permissions; every service re-verifies the token, and a 27-case
  permission matrix plus a 73-check persona suite prove five roles see exactly what they should.
- Separated interactive and programmatic traffic in the gateway: API keys are limited by plan (per-minute token
  buckets and monthly quotas, 429 with Retry-After), while people get a fair-use ceiling, after a live walk showed the
  UI's fan-out would lock users out of their own data within days.
- Built a usage-metering pipeline (gateway -> Kafka -> idempotent consumer -> TimescaleDB hypertable and continuous
  aggregates) that never blocks a request: events wait in a bounded buffer and requests are unaffected with Kafka down.
- Implemented durable follow-up workflows on Temporal with time-skipping tests that run 45 days of schedule in
  milliseconds, an inbound SMTP listener that parses real replies into the same pipeline, and a reconciler that resumes
  workflows Temporal lost at the item's real stage without sending anything twice.
- Shipped local semantic search with a 7.6 MB static-embedding model run in pure Java (no ML runtime), lifting
  recall@3 from 0.30 to 0.87 (MRR 0.23 to 0.72) on a 30-pair paraphrase gold set, with cited extractive answers and
  per-user isolation enforced by PostgreSQL row-level security.
- Exposed the platform to AI agents through a Model Context Protocol server with read-only, permission-scoped tools and
  an append-only audit trail of every call.
- Load-tested the gateway with k6 (50 virtual users: 47 req/s, p95 137 ms, 0 errors; every rate-limited response
  carried Retry-After) and instrumented all services with OpenTelemetry traces, Prometheus metrics on private
  management ports, and a Grafana dashboard as code.
- Hardened delivery: images that run as non-root on read-only filesystems; a Helm chart with default-deny
  NetworkPolicies; CI that scans every image with Trivy, emits CycloneDX SBOMs, installs the chart on a kind cluster
  and runs an OWASP ZAP baseline; a build-time Content-Security-Policy; a STRIDE threat model and ADRs.
- Kept quality measurable: about 1,516 backend tests against real databases and brokers (Testcontainers) and 2,301
  frontend tests, plus live end-to-end scripts for every product.

## Talking points (for interviews)

- Why a gateway plus a platform token instead of a service mesh or a shared RBAC library (ADR 0001).
- Why usage metering is best effort and how quotas fail open (ADR 0004).
- The bug a user walk found that no unit test could: plans metering the product's own UI (ADR 0007).
- How a 64-dimension model fits a 384-dimension pgvector column without a migration (zero padding preserves cosine).
- What is not done: no public deployment yet; semantic search is English-centric and does not reason.
