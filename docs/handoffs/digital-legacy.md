# digital-legacy: integration handoff

## Files outside `digital-legacy/`

Created:
* `sql-jooq/src/main/resources/db/migration/legacy/V1__init.sql` (replaced the placeholder V1: tables `vaults`, `trustees`, `approvals`, `escalation_steps`, `notification_outbox`, `audit_log`)
* `sql-jooq/src/main/resources/db/migration/legacy_ext/V100__audit_append_only.sql` (plpgsql hash-chain + append-only triggers, `legacy.verify_audit_chain()`)
* `sql-jooq/src/test/java/com/personalplatform/sql/LegacySchemaTest.java`

Changed:
* `sql-jooq/pom.xml`: only the `generate-legacy` execution: added a `<forcedTypes>` entry mapping the DDL parser's `JSON` to `JSONB` (the DDL is parsed in H2, the real columns are `jsonb`).

Nothing else outside `digital-legacy/` was touched (root `pom.xml` already lists the module).

## What the integrator must know

* `spring.flyway.locations` is `classpath:db/migration/legacy,classpath:db/migration/legacy_ext`; both locations share one history table (`legacy.flyway_schema_history`), ext versions are >= 100.
* Security: the service declares its OWN two chains, so platform-security's default chain backs off. `@Order(1)` trustee chain (matcher `/v1/legacy/trustee/**`, `Authorization: Trustee <token>`, `POST /accept` public); `@Order(2)` a re-built copy of the platform Firebase chain (stateless, `/actuator/health` + `/actuator/info` public, JWT resource server). If platform-security's chain changes, mirror it in `config/SecurityConfig`. The `JwtDecoder` still comes from platform-security (needs `FIREBASE_PROJECT_ID` at runtime; tests use a stub).
* Scheduler: `@Scheduled` every 30s unless `legacy.scheduler.enabled=false`; safe to run on several instances (row claims use `FOR UPDATE SKIP LOCKED`). Notifications are log-only; provide `NotificationChannel` beans (higher `@Order` than the defaults) for real gateways.
* The service stores NO secrets: tokens only as hex SHA-256 digests; ciphertext/shares are opaque client output.
* Test infra: tests use `postgres:16` Testcontainers and one shared Spring context; they need Docker. `Shamir` ships in main code as the reference implementation for client libraries; the server itself never calls it.
* Owner uid is stored as `owner_uid varchar(128)` (Firebase `sub`); one vault per owner.
