# consent-gateway: handoff

Files created/changed OUTSIDE `consent-gateway/`:

| Path | Change |
|---|---|
| `sql-jooq/src/main/resources/db/migration/consent/V1__init.sql` | replaced the placeholder: all `consent` tables (parsed by the jOOQ generator) |
| `sql-jooq/src/main/resources/db/migration/consent_ext/V101__audit_append_only.sql` | new: plpgsql function + triggers making `consent.audit_log` append-only (NOT read by the generator) |
| `sql-jooq/src/main/resources/db/migration/consent_ext/V102__single_active_signing_key.sql` | new: partial unique index, at most one ACTIVE signing key (NOT read by the generator) |
| `sql-jooq/src/test/java/com/personalplatform/sql/ConsentSchemaTest.java` | new: runs both locations on Testcontainers Postgres 16, checks generated classes, trigger, index |

`sql-jooq/pom.xml`: **no change**; the existing `generate-consent` execution (scripts `db/migration/consent/*.sql`,
package `com.personalplatform.sql.jooq.consent`) already fits. Nothing else outside the service was touched
(`libs/platform-security` and `auth` are unchanged).

Assumptions the integrator must know:

* **Flyway runs two locations**: `spring.flyway.locations=classpath:db/migration/consent,classpath:db/migration/consent_ext`
  (set in the service's `application.properties`). Flyway versions are global across locations: `V1`, `V101`, `V102` are
  taken. New consent migrations in `consent/` must use a version that is not 101 or 102 and, if they touch the audit
  table or signing keys, must still run after `V1`. Anything the jOOQ DDL parser cannot read (triggers, partial
  indexes, plpgsql) belongs in `consent_ext/`.
* **Two JwtDecoder beans, two chains.** The service declares its own `@Qualifier("firebase")` and `@Qualifier("gateway")`
  `JwtDecoder` beans, so `platform-security`'s default decoder and default chain back off (`@ConditionalOnMissingBean`).
  The Firebase decoder is rebuilt in `SecurityConfig` with `FirebaseJwtDecoderFactory`, so `FIREBASE_PROJECT_ID` is still
  required. Never inject a bare `JwtDecoder` in this service (ambiguous); use the qualifiers. Tests stub the
  `firebase` decoder with a `@Primary` bean carrying the same qualifier (see `TestSupportConfig`).
* **Required env**: `FIREBASE_PROJECT_ID`, `CONSENT_KEY_ENCRYPTION_KEY` (base64, 32 bytes; startup fails without it
  unless `SPRING_PROFILES_ACTIVE=dev`). Set `CONSENT_ISSUER` to the public base URL; clients/verifiers check `iss`.
  Losing/changing `CONSENT_KEY_ENCRYPTION_KEY` makes the stored signing keys undecryptable (startup fails fast).
* Public, unauthenticated by design: `/.well-known/jwks.json`, `/v1/oauth/**` (clients authenticate with id+secret
  inside the controller), `/actuator/health`. If a gateway/ingress fronts services by path, route these through.
* The service reads only its own schema `consent`. It uses the `Clock` bean everywhere (tests replace it).
* A client is tied to the owner that registered it (single-owner request routing); see README limitations.
* Tests use `postgres:16` via Testcontainers and need the Docker env vars from the brief. All Spring tests share one
  context/container and isolate by random owner ids (the audit log cannot be truncated by design).
