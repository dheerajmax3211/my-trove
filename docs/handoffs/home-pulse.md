# home-pulse hand-off

## Files created or changed OUTSIDE `home-pulse/`

1. `sql-jooq/src/main/resources/db/migration/home_pulse/V1__init.sql` (replaced placeholder): plain tables
   `appliances`, `devices`, `readings`, `baselines`, `alerts` (parseable by the jOOQ generator).
2. `sql-jooq/src/main/resources/db/migration/home_pulse_ext/V100__timescale_hypertable.sql`,
   `V101__continuous_aggregates.sql`, `V102__policies.sql` (new folder, NOT read by the generator; TimescaleDB-only SQL).
3. `sql-jooq/src/test/java/com/personalplatform/sql/HomePulseSchemaTest.java` (new; runs on `timescale/timescaledb:2.32.0-pg16`).

No change was needed to `sql-jooq/pom.xml`: the existing `generate-home_pulse` block already reads
`src/main/resources/db/migration/home_pulse/*.sql` and the ext folder is outside that glob.
Nothing else outside `home-pulse/` was touched. `home-pulse/pom.xml` gained one dependency
(`org.eclipse.paho:org.eclipse.paho.mqttv5.client:1.2.5`).

## Assumptions the integrator must know

* **TimescaleDB is required.** The shared root `docker-compose.yml` uses `postgres:16`, which cannot run the V100+ migrations.
  Either switch that image to `timescale/timescaledb:2.32.0-pg16` (data-compatible with the other schemas; same port/credentials) or
  use `home-pulse/docker-compose.yml`. The DB user needs `create extension timescaledb` (the image preinstalls it in `POSTGRES_DB`).
  Production Postgres must have the `timescaledb` library in `shared_preload_libraries`.
* **Two Flyway locations, one history table:** `spring.flyway.locations=classpath:db/migration/home_pulse,classpath:db/migration/home_pulse_ext`.
  The ext versions start at 100 (V1 plain, V100-V102 ext). A future plain migration should use V2..V99, a future ext one V103+.
* `readings` is created plain in V1 (typed jOOQ class) and turned into a hypertable in V100; the continuous aggregates
  `readings_1m` / `readings_1h` are accessed through hand-written handles in `home-pulse/.../reading/TimescaleViews.java`.
* **Security:** the service declares its own two `SecurityFilterChain` beans (platform-security's default chain backs off once a
  service declares any chain): order 1 = `/v1/ingest/**` with per-device tokens (SHA-256 hash stored, not Firebase), order 2 = the
  platform default behaviour (Firebase JWT, health public). Tests use a stub `JwtDecoder` (token = base64url of a `uid-...` string).
* Test data is stamped in 2031 on purpose (see README) and tests use a manual clock; the suite starts one TimescaleDB container for the Spring tests
  and one for `HomePulseSchemaTest`. Test image is 2.5 GB uncompressed on first pull.
* MQTT is off by default (`app.mqtt.enabled=false`) and was not verified against a real broker.
