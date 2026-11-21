# waiting-on: integrator handoff

## Files created or changed OUTSIDE `waiting-on/`

All in `sql-jooq/`:

1. `sql-jooq/src/main/resources/db/migration/waiting_on/V1__init.sql`: **replaced** the placeholder (tables `items`, `item_events`).
2. `sql-jooq/src/main/resources/db/migration/waiting_on_ext/V2__timeline_append_only.sql`: **new folder + file**. plpgsql
   triggers that make `item_events` append-only. Not read by the jOOQ generator (its glob is `waiting_on/*.sql`).
3. `sql-jooq/src/test/java/com/personalplatform/sql/WaitingOnSchemaTest.java`: **new** (Testcontainers, Flyway with both locations).

`sql-jooq/pom.xml`: **not changed**. The pre-existing `generate-waiting_on` execution already matches the migration folder.
No other file outside `waiting-on/` was touched (root pom, root docker-compose, auth, libs: untouched).

## What the integrator must know

* **Flyway locations**: the service runs `classpath:db/migration/waiting_on` **and** `classpath:db/migration/waiting_on_ext`
  (set in `waiting-on/src/main/resources/application.properties`). Any other runner/test of this schema must list both,
  or the append-only triggers will be missing. Version numbers are global across the two locations (V1, V2): new
  migrations must use V3+ in whichever folder fits (plpgsql/triggers -> `_ext`).
* **Temporal is required at runtime** unless `TEMPORAL_ENABLED=false`. The service does not start (clear message) when
  `app.temporal.target` (`TEMPORAL_TARGET`, default `127.0.0.1:7233`) is unreachable. Nothing was added to the root
  `docker-compose.yml`; run `temporal server start-dev` or the Docker one-liner in `README.md`.
* **Dependencies added** (in `waiting-on/pom.xml` only): `io.temporal:temporal-sdk` and `temporal-testing` (test), version
  property `temporal.version=1.41.1`. They bring gRPC, protobuf and Jackson 2 transitively; no conflict with Boot 4 /
  Jackson 3 was observed. If a parent BOM later manages grpc/protobuf/jackson 2 differently, re-run
  `FollowUpWorkflowTest` and `RealTemporalServerTest`.
* **Security**: the service declares its own two `SecurityFilterChain`s (so the platform-security default backs off):
  `/v1/webhooks/**` (shared secret `X-Webhook-Secret`, env `INBOUND_WEBHOOK_SECRET`; blank = webhook rejects everything) and
  the Firebase JWT chain for the rest (same rules as the platform default). Set `INBOUND_WEBHOOK_SECRET` and
  `REPLY_DOMAIN` (domain whose `waiting+<token>@domain` addresses route to the provider's inbound webhook) in deployment.
* **Gateway/API routing**: user API is `/v1/items/**`; the webhook path `/v1/webhooks/inbound-email` must be reachable by
  the email provider without a Firebase token.
* Identity is the Firebase uid (`jwt.getSubject()`), stored as `owner_uid varchar(128)`; every user query is scoped by it.
* Tests share one Postgres container per JVM (`TestcontainersConfiguration` in the test sources starts it statically).
  `RealTemporalServerTest` is skipped unless `REAL_TEMPORAL=true` (needs the `temporalio/temporal` image).
* Auto-configurations registered in `waiting-on/src/main/resources/META-INF/spring/...AutoConfiguration.imports`
  (`WaitingOnDefaultsAutoConfiguration`, `TemporalClientAutoConfiguration`) and a `FailureAnalyzer` in `META-INF/spring.factories`.
