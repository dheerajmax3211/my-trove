# home-pulse

Predictive maintenance for a home. Smart plugs / ESP32 power sensors report the power draw of appliances (fridge,
AC, water pump, washing machine). The service learns each appliance's **normal electrical signature**, warns before
it fails (a compressor drawing 18% more current, ever longer duty cycles, a unit that never switches off or never
switches on) and ties every alert to the appliance's **service dates and warranty**, so an anomaly on a unit that is
still under warranty is surfaced as a claim opportunity.

Port `8085`, Postgres schema `home_pulse`, Spring Boot 4.1.2 / Java 21 / jOOQ / TimescaleDB.

## Architecture

```
 ESP32 / smart plug                                    owner app (Firebase ID token)
   |  HTTPS POST /v1/ingest/readings                      |  /v1/appliances, /alerts, /health, /readings, /reminders
   |  Bearer hpd_<device token>                           |
   |                                  MQTT                |
   |   homepulse/{deviceId}/reading --------+             |
   v                                        v             v
 [chain 1: DeviceTokenFilter]      [MqttSubscriber]   [chain 2: Firebase JWT resource server]
   token hash lookup                 (Paho, OFF by       @AuthenticationPrincipal Jwt -> uid
        |                             default)                 |
        v                                 v                    v
   IngestService  <------ MqttReadingMapper (pure) ---   owner-scoped services/repositories
        | INSERT ... ON CONFLICT (device_id, ts) DO NOTHING          (every query has owner_uid = ?)
        v
 +---------------------------- Postgres + TimescaleDB, schema home_pulse -----------------------------+
 |  readings (hypertable, 1-day chunks, compressed after 7 d, dropped after 90 d)                      |
 |     |--> readings_1m  continuous aggregate (real-time, refresh 1 min, kept 1 y)                      |
 |     '--> readings_1h  continuous aggregate (real-time, refresh 15 min, kept 5 y)                     |
 |  appliances, devices (token hash), baselines (learned signature, jsonb), alerts (jsonb evidence)    |
 +------------------------------------------------------------------------------------------------------+
        ^                                                       |
        | 1-min samples (last 48 h)                             | open / refresh / resolve alerts
        |                                                       v
 EvaluationJob (@Scheduled, injected Clock) --> EvaluationService --> AnomalyDetector (pure) + AlertReconciler (pure)
                                                        |
                                                        '--> BaselineLearner (pure): robust statistics (median / MAD)
```

Package map: `detect` (pure domain: learner, detector, reconciler, no Spring), `ingest` (HTTP + MQTT ingestion),
`device`, `appliance`, `reading` (queries + continuous aggregate handles), `alert`, `eval` (scheduled evaluation),
`health`, `reminder` (pure calculator + endpoint), `config` (security chains, properties, clock), `web` (errors).

## The heavy-tech pieces and why they are justified

* **TimescaleDB.** One plug at 1 Hz is 86,400 rows/day; ten appliances is ~26 M rows a month of append-only,
  time-ordered data that is queried by (device, time range). A hypertable partitions it into daily chunks (cheap
  retention by dropping chunks, cheap inserts), **columnar compression** (segment by device) shrinks week-old chunks
  roughly 10x, **continuous aggregates** keep the 1-minute and 1-hour rollups incrementally up to date so the anomaly
  job and the charts never scan raw rows, and **policies** (refresh, compress, retain) run inside the database.
  Plain Postgres would need hand-rolled partitioning, cron jobs and rollup tables for the same result.
* **Streaming-style anomaly detection.** The evaluator is a pure function over a sliding window of 1-minute samples
  and a learned baseline (see below); it is deterministic, unit-testable with simulated data and cheap enough to run
  every 5 minutes per appliance. No ML framework: robust statistics are explainable ("running power is 11% higher
  than its learned normal, 1063 W vs 957 W") which matters when you tell someone to call a technician.
* **MQTT adapter.** The native protocol of ESP32 / Tasmota / Shelly devices. Optional (off by default); the HTTP
  endpoint covers everything else.

## How detection works (`com.personalplatform.homepulse.detect`)

1. **Baseline learning** (`BaselineLearner`). After `app.evaluation.learn-days` (7) of data, the 1-minute samples are
   cut into 6-hour windows. Per window: ON fraction (duty), median ON-state power, mean length of completed ON runs.
   The baseline stores the **median across windows** of each feature and a **robust sigma** (1.4826 x MAD), plus
   standby (p10) / peak (p99) power, the ON/OFF threshold (midpoint), and the p99 of ON and OFF run lengths.
   Medians and MAD are insensitive to door-opens, glitches and brown-outs during learning (unit tested).
   `POST /v1/appliances/{id}/baseline/relearn` restarts learning after a repair.
2. **Detection** (`AnomalyDetector`), every evaluation, on the last 48 h of 1-minute data:
   * `POWER_SHIFT`: median ON power of recent windows vs baseline.
   * `DUTY_CYCLE_DRIFT`: fraction of time ON and mean ON-cycle length (refrigerant leak: same power, longer runs).
   * `STUCK_ON`: current ON run longer than `max(floor, 3 x longest normal run)` (fridge floor 3 h, AC 12 h).
   * `STOPPED`: a cycling appliance (fridge) has not switched on for `max(6 h, 3 x longest normal pause)`: dead or unplugged
     while the sensor still reports.
   * `NO_DATA`: the sensor is silent for longer than the type's grace time (fridge 60 min); never-reported devices too.
   A deviation counts only when it exceeds `max(3.5 sigma, relative tolerance, absolute floor)` **and is sustained**:
   at least 3 of the last 4 windows (6 h each) deviate in the same direction including the newest one.
   Windows with < 70% of their minutes present are skipped, so data gaps do not create or hide anomalies.
3. **Lifecycle** (`AlertReconciler` + partial unique index `(appliance_id, kind) where live`). One live alert per
   appliance and kind: a persisting condition refreshes severity/evidence (escalating WARNING to CRITICAL), never opens a
   second alert; it auto-resolves after 3 consecutive clean evaluations; a kind that could not be evaluated this run
   (e.g. everything except NO_DATA while the sensor is silent) is left untouched. A live alert uses a tolerance of 70%
   of normal for its own kind (hysteresis), so a value hovering at the threshold does not open/resolve/re-open all day.
   Acknowledged alerts stay live (deduplicated) and resolve automatically too.

Measured on the simulator (`ApplianceSimulator`, tests `AnomalyDetectorTest` / `AlertLifecycleTest`): over 60+ days and
3 seeds a healthy fridge and a healthy AC raise **zero** alerts (including a 45-minute power cut and a 5-hour data gap);
an AC whose ON power degrades 0.6% per day is flagged at about +11% excess, about 12 days before the +18% failure
threshold, with a single non-flapping alert; a fridge compressor degrading 0.5%/day is flagged before +18%; a refrigerant-leak
fridge (longer runs, same power) raises `DUTY_CYCLE_DRIFT` and no `POWER_SHIFT`.

## Persistence layout and the jOOQ / Timescale split

* `sql-jooq/.../db/migration/home_pulse/V1__init.sql`: plain tables (appliances, devices, readings, baselines, alerts),
  parsed by the jOOQ generator (package `com.personalplatform.sql.jooq.home_pulse.home_pulse`).
* `sql-jooq/.../db/migration/home_pulse_ext/V100..V102`: `create extension`, `create_hypertable`, compression settings,
  the two continuous aggregates, and the refresh / compression / retention policies. The generator never reads this
  folder. Both folders are Flyway locations of the service (`spring.flyway.locations`) and share one history table,
  hence the `V100+` numbering.
* **Readings mapping decision:** `readings` is created as a *plain table* in V1 (so jOOQ generates a typed
  `Tables.READINGS`) and converted into a hypertable in V100. The two continuous aggregates do not exist for the
  generator, so `reading/TimescaleViews` holds hand-written `DSL.table` / `DSL.field` handles for them.
* Continuous aggregates are created `WITH NO DATA` (a populated cagg cannot be created inside Flyway's transaction;
  the table is empty at that point anyway) and with `materialized_only = false` (real-time aggregation).

## Endpoints

Owner APIs (Firebase ID token, `Authorization: Bearer <id-token>`; every row is scoped to the caller's uid, someone
else's id yields `404`):

| Method and path | Purpose |
| --- | --- |
| `POST/GET /v1/appliances`, `GET/PUT/DELETE /v1/appliances/{id}` | Appliance CRUD (name, type, location, purchase / warranty end, last / next service) |
| `POST /v1/appliances/{id}/devices` | Register a plug/sensor; returns the **one-time** `ingestionToken` (`201`; `409` while another is active) |
| `GET /v1/appliances/{id}/devices`, `DELETE /v1/devices/{deviceId}` | List (never shows tokens) / revoke (rotation = revoke + register) |
| `GET /v1/appliances/{id}/readings?from&to&resolution` | Downsampled series; bucket by range: <= 1 h raw, <= 2 d 1-minute, <= 60 d 1-hour, else 1-day (max 5000 points) |
| `GET /v1/alerts?status&applianceId&includeResolved&limit`, `GET /v1/alerts/{id}`, `POST /v1/alerts/{id}/ack` | Alerts with warranty / service context |
| `GET /v1/appliances/{id}/health` | Status (HEALTHY / WARNING / CRITICAL / LEARNING / NO_DEVICE), baseline, last 24 h (avg/max W, kWh, duty %), live alerts, service info |
| `POST /v1/appliances/{id}/baseline/relearn` | Forget the baseline (after a repair), close judgement alerts |
| `GET /v1/reminders?days=60` | Service due/overdue, warranty ending, and high-priority "anomaly while under warranty" |

Built-in simulator (no hardware needed), owner-authenticated, appliance must be the caller's (`404` otherwise):

| Method and path | Purpose |
| --- | --- |
| `POST /v1/appliances/{id}/simulation` body `{"days":1..14 (7),"scenario":"NORMAL"\|"ANOMALY" (NORMAL)}` | Ensures a device flagged `simulated` ("Built-in simulator", random token, only the hash stored, plaintext never returned or logged; `409` when the appliance has a real active device), replaces the previous simulated history, generates 5-minute readings ending now through `IngestService`, learns the baseline from the healthy part and evaluates once. Returns `{readingsInserted, baselineStatus, alertOpened}` |
| `DELETE /v1/appliances/{id}/simulation` | Deletes the simulated device, its readings and baseline, closes alerts that came from simulated data (`204`, also when nothing is running) |

`simulated: boolean` is exposed on devices, alerts, `/health` and `/readings`. The scheduled evaluation skips simulated devices
(a snapshot would only raise `NO_DATA` an hour later). A baseline needs about 3 days of history (8 six-hour windows); with fewer
days the status stays `LEARNING`. `ANOMALY` appends a type-specific deviation in the last hours (fridge compressor never stops, etc.).
The minute series is gap-filled for gaps of up to 4 minutes (`SampleGapFill`) so any 5-minute sensor is judged like a 1-minute one.

Device API (separate filter chain, ordered first): `POST /v1/ingest/readings` with `Authorization: Bearer hpd_...`:

```json
{"readings":[{"ts":"2031-01-15T11:59:30Z","watts":118.4,"volts":229.8,"amps":0.52}]}
```
returns `{"received":1,"accepted":1,"duplicates":0,"rejected":0}`. Max 1000 readings per request; readings more than 5 min in
the future or older than 30 days are counted as `rejected`. `(device_id, ts)` is the primary key and conflicts are ignored,
so retries are safe. A Firebase token is rejected here and a device token is rejected on every owner endpoint.

MQTT (when enabled): topic `homepulse/{deviceId}/reading`, payload `{"watts":118.4,"volts":229.8,"amps":0.52,"ts":1767225600}`
(`ts` optional: epoch s / ms / ISO-8601, default receive time). Malformed messages are dropped and counted, never thrown.
MQTT messages carry no per-message token: authenticate devices at the broker (per-device credentials + topic ACL
`homepulse/<own id>/reading`); the service only checks the id belongs to a live device.

## Run locally

```bash
docker compose -f home-pulse/docker-compose.yml up -d          # TimescaleDB on 5433 (the root compose file's plain postgres:16 is not enough)
export FIREBASE_PROJECT_ID=<your-firebase-project>
./mvnw -pl home-pulse -am spring-boot:run
# optional MQTT:  docker compose -f home-pulse/docker-compose.yml --profile mqtt up -d ; MQTT_ENABLED=true ...
```

Flyway creates the schema, the hypertable, aggregates and policies on first start (the DB user must be allowed to
`create extension timescaledb`, or have it pre-installed; the Timescale image installs it in `POSTGRES_DB`).

## Configuration

| Variable / property | Default | Meaning |
| --- | --- | --- |
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | `jdbc:postgresql://localhost:5433/platform`, `platform`, `platform` | Database |
| `FIREBASE_PROJECT_ID` | (required) | Owner-API token audience |
| `MQTT_ENABLED` (`app.mqtt.enabled`) | `false` | Start the Paho subscriber |
| `MQTT_BROKER_URI`, `MQTT_CLIENT_ID`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_TOPIC_FILTER` | `tcp://localhost:1883`, `home-pulse`, empty, empty, `homepulse/+/reading` | MQTT adapter |
| `EVALUATION_ENABLED`, `EVALUATION_INTERVAL` | `true`, `PT5M` | Scheduled anomaly evaluation |
| `LEARN_DAYS` (`app.evaluation.learn-days`) | `7` | Learning period |
| `app.evaluation.resolve-after-clear-runs` | `3` | Clean runs before auto-resolve |
| `app.ingest.max-batch-size` / `max-future-skew` / `max-age` | `1000` / `PT5M` / `P30D` | Ingestion limits |

## Tests (`./mvnw -pl home-pulse -am verify`, needs Docker; image `timescale/timescaledb:2.32.0-pg16`)

* Detector, learner, reconciler on simulated data (`AnomalyDetectorTest`, `AlertLifecycleTest`): healthy fridge/AC with
  zero alerts over 60+ days x 3 seeds, degrading compressor caught early, refrigerant leak, stuck-on, dead (stopped),
  silent sensor, never-reported device, data gaps, baseline robustness, dedup and auto-resolve in simulated time.
* `MqttReadingMapperTest` (47 cases, malformed payloads and topics), `ResolutionTest`, `DeviceTokensTest`, `ReminderCalculatorTest`.
* `IngestionApiTest`: bad / missing / revoked / wrong-scheme tokens, Firebase token rejected on ingest and device token
  rejected on owner APIs, hash-only storage, idempotent retries, validation and limits.
* `OwnerApiTest`: CRUD, devices, readings resolution via the continuous aggregates, alerts and ack, health, reminders,
  **cross-owner isolation** (user B gets 404 / empty lists for everything of user A).
* `EvaluationIntegrationTest`: simulator -> hypertable -> real-time aggregate -> evaluation job -> alerts -> API, with a manual clock.
* `MqttIngestHandlerTest`: message handling and idempotency without a broker.
* `sql-jooq/.../HomePulseSchemaTest` (timescale image): hypertable, both continuous aggregates, compression / retention /
  refresh policies exist; rollup buckets are exactly as expected before and after materialization; generated jOOQ classes match
  Postgres; idempotent insert also on a compressed chunk.
* Test data is stamped in the year 2031 so Timescale's wall-clock based background jobs (refresh, compression, retention)
  can never move a watermark over it or drop it; the suite never sleeps.

## Honest limitations and next steps

* **Not verified against a real MQTT broker.** `MqttSubscriber` (Paho v5 wiring: connect, reconnect, subscribe) compiles but
  was never run end to end; mapping, device check and storage are tested through `MqttIngestHandler`.
* **Baseline = the first week of data.** If the appliance is already degraded when installed, "normal" is wrong. Learning
  is not seasonal: an AC baseline learned in spring will see a heat wave as a larger duty cycle. Hence the AC's duty tolerance is
  60%, and power shift is its main signal. Next: normalise by outdoor temperature, per-hour-of-day baselines, drift-aware re-learning.
* Window length (6 h) and sustain rule (3 of 4) trade latency (about 18 h after a fault crosses the threshold) for very few false alarms;
  constants live in `DetectorProfile`, tuned on simulated data only. **No real appliance data was used.**
* The evaluation job is not distributed-locked: two instances would both evaluate (harmless, the partial unique index
  prevents duplicate alerts) but waste work. Add `pg_try_advisory_lock` or ShedLock before scaling out.
* Late data behind the continuous-aggregate watermark only appears after the refresh policy runs (verified in
  `HomePulseSchemaTest`); the refresh window reaches 80 days back, ingestion accepts 30 days. Older backfill is stored raw but needs a manual `refresh_continuous_aggregate`.
* One live device per appliance (rotate by revoke + register); readings of revoked devices stay queryable. No notification
  channel (push/email) yet: alerts are pull-only via the API. Washing machine and "other" profiles only get stuck-on / no-data (and
  power shift for "other"), not cycle analysis.
* Inserting into compressed chunks with `ON CONFLICT DO NOTHING` works on this Timescale version (tested) but decompresses batches; keep the
  compression delay above the longest expected backfill.
* The repo-level `docker-compose.yml` runs plain `postgres:16`; use `dev/docker-compose.yml` (TimescaleDB, pgvector and Temporal in one stack).
