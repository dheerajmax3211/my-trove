# shared-service HANDOFF

Everything created or changed OUTSIDE `shared-service/`:

## sql-jooq
| Path | Change |
|---|---|
| `sql-jooq/src/main/resources/db/migration/shared/V1__init.sql` | **Replaced** the placeholder: households, household_members, household_invites, reminders, notifications (outbox), files, audit_events. Parseable by jOOQ (no plpgsql). |
| `sql-jooq/src/main/resources/db/migration/shared_ext/V100__audit_events_immutable.sql` | **New folder + file**: plpgsql trigger function and triggers rejecting UPDATE/DELETE/TRUNCATE on `shared.audit_events`. Not read by the generator. |
| `sql-jooq/pom.xml` | Only the `generate-shared` execution: added a `<forcedTypes>` block mapping `json` -> `JSONB` (DDLDatabase reads `jsonb` as `json`). Nothing else touched. |
| `sql-jooq/src/test/java/com/personalplatform/sql/SharedSchemaTest.java` | **New**: runs both migration locations on Postgres 16, checks generated tables against the DB, proves the audit trigger and CHECK constraints. |

No other file outside `shared-service/` was changed. Root `pom.xml` already lists the module.

## Assumptions the integrator must know
* **Flyway locations** for this service are `classpath:db/migration/shared,classpath:db/migration/shared_ext` (set in `shared-service/src/main/resources/application.properties`). Versions `V1..V99` belong in `shared/`, `V100+` in `shared_ext/`; do not reuse a version number across the two folders (one shared history table).
* **Own `SecurityFilterChain`** (`common/SecurityConfig`): same as platform-security's default plus one public path, `GET /v1/files/download` (HMAC-signed token is the credential). The platform default chain therefore backs off for this service.
* **Authorization contract for other services**: member of household X with role Y = row in `shared.household_members(household_id, member_uid, role in OWNER|MEMBER)`, or `GET /v1/households/{id}/membership` with the caller's token (200 or 404). Non-members get 404, insufficient role 403.
* **Required runtime config**: `FIREBASE_PROJECT_ID`; `FILE_TOKEN_SECRET` (>= 32 chars) for stable download links, especially with more than one instance; `FILES_ROOT` must be a shared volume if more than one instance runs (local-FS blob store).
* **DB role**: app role needs DML on schema `shared`. For the strongest audit guarantee do not make it the table owner and revoke UPDATE/DELETE/TRUNCATE on `shared.audit_events`.
* Tests use `postgres:16` via Testcontainers; run only one Maven invocation at a time.
* Other services can write audit rows only through their own mechanisms for now; the audit API is read-only and `AuditService.record` is in-process (no cross-service write endpoint was built).
