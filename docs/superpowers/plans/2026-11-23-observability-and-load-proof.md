# Observability and Load Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all ten Spring services observable (metrics, traces, one dashboard) and prove, with a repeatable load test and written numbers, how the gateway behaves under load, all on free, self-hosted tools.

**Architecture:** Each service serves Prometheus metrics and sends traces over OTLP, on a private management port that the public port and the gateway never expose. A local Docker profile runs Prometheus, Jaeger and Grafana. A k6 script drives authenticated load through the gateway, and its results are written to a report.

**Tech Stack:** Spring Boot Actuator, Micrometer with the Prometheus registry, Micrometer Tracing with the OpenTelemetry bridge and OTLP exporter, Jaeger all-in-one (accepts OTLP), Prometheus, Grafana (provisioned), k6 (run from its Docker image).

**Spec:** `docs/superpowers/specs/2026-11-21-trove-platform-v2-design.md` (observability design, and Phase 5 "OpenTelemetry + Prometheus + Grafana" and "k6 load results"). This plan implements only those items. Helm, kind, image scanning, Playwright and ZAP stay in later plans.

## Global Constraints

- Java 21, Spring Boot 4.1.2, Spring Cloud 2026.0.0 with `spring.cloud.compatibility-verifier.enabled=false` (as in `gateway/src/main/resources/application.yml`).
- Every tool is free and self-hosted. No paid service, no cloud account.
- Pulling Docker images and running k6 on the owner's machine need the owner's explicit yes at that time (spec, Downloads/installs).
- The management port is never published by Docker and never routed by the gateway.
- Trace sampling is `1.0` in dev and `0.1` during load tests.
- Management port convention: `MANAGEMENT_PORT` defaults to the service's main port plus 1000 (gateway 8080 becomes 9080, platform-service 8089 becomes 9089, shared-service 8082 becomes 9082, and so on).

## Review Focus

1. A signed-in user (valid token) must not read `/actuator/prometheus` on the main port: metrics show other services' names and internal routes. (Task 1)
2. Metric labels must use route templates, never raw ids or emails, or the metrics store leaks identities and grows without limit. (Task 1)
3. Traces and logs must never contain a bearer token or an `Authorization` value. (Task 1)
4. A tracing or metrics backend that is down or unreachable must not slow or fail user requests. (Task 3)
5. A burst past the FREE-plan rate limit must return 429 with `Retry-After`, never 5xx or a hang, and the load test must count those 429s as expected, not as errors. (Task 5)

---

### Task 1: Gateway and platform-service: private metrics, tracing, log correlation

**Files:**
- Modify: `gateway/pom.xml`, `gateway/src/main/resources/application.yml`
- Modify: `platform-service/pom.xml`, `platform-service/src/main/resources/application.properties`
- Test: `gateway/src/test/java/com/personalplatform/gateway/ObservabilityExposureTest.java`
- Test: `platform-service/src/test/java/com/personalplatform/platform/ObservabilityExposureTest.java`

**Interfaces:**
- Consumes: the existing test token helper used by gateway tests (reuse; do not add a second one).
- Produces: `MANAGEMENT_PORT` env var; `/actuator/prometheus` and `/actuator/health` on the management port; a log pattern that includes `traceId` and `spanId`. Tasks 2 to 5 rely on these names and on the port convention.

- [ ] **Step 1: Write the failing exposure test (gateway)**

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "management.server.port=0")
class ObservabilityExposureTest {

    @LocalServerPort int port;
    @LocalManagementPort int managementPort;

    @Test
    void metricsAreServedOnTheManagementPortOnly() {
        assertThat(status("http://localhost:" + managementPort + "/actuator/prometheus")).isEqualTo(200);
        assertThat(status("http://localhost:" + port + "/actuator/prometheus")).isIn(401, 403, 404);
    }

    @Test
    void aSignedInUserCannotReadMetricsOnTheMainPort() {
        assertThat(statusWithToken("http://localhost:" + port + "/actuator/prometheus", memberToken()))
                .isNotEqualTo(200);
    }

    @Test
    void metricLabelsUseRouteTemplatesNotIds() {
        getWithToken("http://localhost:" + port + "/api/shared/v1/households/" + UUID.randomUUID(), memberToken());
        String scrape = body("http://localhost:" + managementPort + "/actuator/prometheus");
        assertThat(scrape).doesNotContainPattern("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}");
    }

    @Test
    void logsCarryTheTraceIdAndNeverATokenValue() {
        // Capture the root logger's output (the log capture the gateway tests already use), then send one
        // request with "Authorization: Bearer <memberToken()>" and a traceparent header.
        String logs = capturedLogsDuring(() -> getWithToken(
                "http://localhost:" + port + "/actuator/health", memberToken(),
                "traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"));
        assertThat(logs).contains("4bf92f3577b34da6a3ce929d0e0e4736");   // trace id is in the log line
        assertThat(logs).doesNotContain("Bearer ");                      // and no token value
        assertThat(logs).doesNotContain(memberToken());
    }
}
```

`status`, `statusWithToken`, `body`, `getWithToken` and `memberToken` are the existing gateway test helpers, or small wrappers over `TestRestTemplate`. The `logsCarryTheTraceIdAndNeverATokenValue` body uses the log capture the gateway tests already use.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `./mvnw -pl gateway -Dtest=ObservabilityExposureTest test`
Expected: FAIL, because `LocalManagementPort` returns the main port, and the prometheus endpoint is not on a separate port yet.

- [ ] **Step 3: Add the dependencies and the management config**

In `gateway/pom.xml` and `platform-service/pom.xml`, add `micrometer-registry-prometheus`, `micrometer-tracing-bridge-otel` and `opentelemetry-exporter-otlp`. Take versions from the Boot BOM; do not pin them.

In `application.yml` (gateway) and `application.properties` (platform-service):

```properties
management.server.port=${MANAGEMENT_PORT:9080}
management.endpoints.web.exposure.include=health,info,prometheus
management.endpoints.web.base-path=/actuator
management.tracing.sampling.probability=${TRACING_SAMPLING:1.0}
management.opentelemetry.tracing.export.otlp.endpoint=${OTLP_TRACES_ENDPOINT:http://localhost:4318/v1/traces}
logging.pattern.correlation=[${spring.application.name:-},%X{traceId:-},%X{spanId:-}]
```

The gateway's existing `blocked` list (`/actuator/**`) stays as it is, so the main port keeps refusing actuator paths.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `./mvnw -pl gateway -Dtest=ObservabilityExposureTest test`
Expected: PASS, all four tests.

- [ ] **Step 5: Repeat for platform-service with the same test body**

Run: `./mvnw -pl platform-service -Dtest=ObservabilityExposureTest test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add gateway platform-service
git commit -m "obs: private management port with Prometheus, OTLP traces and log correlation (gateway, platform)"
```

---

### Task 2: The other eight services get the same configuration

**Files (each of the eight):**
- Modify: `auth/pom.xml`, `shared-service/pom.xml`, `waiting-on/pom.xml`, `consent-gateway/pom.xml`, `home-pulse/pom.xml`, `ask-your-life/pom.xml`, `digital-legacy/pom.xml`, `family-treasury/pom.xml`
- Modify: the matching `src/main/resources/application.properties` (consent-gateway also has `application-dev.properties`, which must not override these keys)
- Test: `<service>/src/test/java/.../ObservabilityExposureTest.java` (same body as Task 1)

**Interfaces:**
- Consumes: the config keys and test body from Task 1.
- Produces: the same port convention for every service.

- [ ] **Step 1: Copy the Task 1 test into each service, changing only the package**

- [ ] **Step 2: Run each test and confirm it fails**

Run: `./mvnw -pl <service> -Dtest=ObservabilityExposureTest test` for each of the eight.
Expected: FAIL on each (management port not yet configured).

- [ ] **Step 3: Apply the Task 1 pom and properties changes to each service**

Set each service's `MANAGEMENT_PORT` default to its main port plus 1000. Use the main port listed in the gateway's `application.yml` comment.

- [ ] **Step 4: Run each test and confirm it passes**

Expected: PASS for all eight.

- [ ] **Step 5: Commit**

```bash
git add auth shared-service waiting-on consent-gateway home-pulse ask-your-life digital-legacy family-treasury
git commit -m "obs: same private metrics and tracing config for the eight product and identity services"
```

---

### Task 3: Tracing and metrics backends can be down without breaking requests

**Files:**
- Test: `gateway/src/test/java/com/personalplatform/gateway/TelemetryFailureTest.java`
- Modify (only if the test fails): `gateway/src/main/resources/application.yml`

**Interfaces:**
- Consumes: `OTLP_TRACES_ENDPOINT` from Task 1.
- Produces: confirmed behaviour that the exporter is asynchronous and bounded.

- [ ] **Step 1: Write the failing test**

Start the gateway with `OTLP_TRACES_ENDPOINT=http://localhost:1/v1/traces` (a closed port). Send 50 authenticated requests to `/api/auth/v1/me`. `base` is the gateway's main URL from the test's random port. `percentile(values, p)` returns the value at that percentile of a sorted copy of `values`.

```java
@Test
void requestsStayFastWhenTheTraceBackendIsDown() {
    List<Long> millis = new ArrayList<>();
    for (int i = 0; i < 50; i++) {
        long start = System.nanoTime();
        assertThat(statusWithToken(base + "/api/auth/v1/me", memberToken())).isEqualTo(200);
        millis.add((System.nanoTime() - start) / 1_000_000);
    }
    assertThat(percentile(millis, 95)).isLessThan(500);
}
```

- [ ] **Step 2: Run the test**

Run: `./mvnw -pl gateway -Dtest=TelemetryFailureTest test`
Expected: PASS if the exporter is asynchronous (the expected result). If it FAILS, the exporter is blocking requests: set `management.opentelemetry.tracing.export.otlp.timeout` to a small value and make the exporter batch asynchronously, then rerun until PASS.

- [ ] **Step 3: Commit**

```bash
git add gateway
git commit -m "obs: test that an unreachable trace backend does not slow requests"
```

---

### Task 4: Local observability stack, dashboard, and end-to-end proof

**Files:**
- Create: `dev/observability/prometheus.yml`
- Create: `dev/observability/grafana/provisioning/datasources/datasources.yml`
- Create: `dev/observability/grafana/provisioning/dashboards/dashboards.yml`
- Create: `dev/observability/grafana/dashboards/trove-overview.json`
- Create: `dev/e2e-observability.sh`
- Modify: `dev/docker-compose.yml` (add the `observability` profile: `prometheus`, `jaeger`, `grafana`)
- Modify: `dev/up.sh` (set `MANAGEMENT_PORT` and `OTLP_TRACES_ENDPOINT` per service)

**Interfaces:**
- Consumes: the management port convention and the OTLP endpoint from Tasks 1 and 2.
- Produces: Prometheus on `localhost:9090`, Jaeger UI on `localhost:16686`, Grafana on `localhost:3000`.

- [ ] **Step 1: Write the failing end-to-end script**

`dev/e2e-observability.sh` sends 40 requests through the gateway, waits 20 seconds, then asserts:
- Prometheus returns a non-empty result for `http_server_requests_seconds_count{application="gateway"}`.
- Jaeger's `/api/services` lists `gateway`.
- Every dashboard panel's PromQL query returns data (the script reads the panels from the dashboard JSON). The 429 panel is the exception: it is checked after the rate-limit probe in Task 5, so this script skips it.

- [ ] **Step 2: Run it and confirm it fails**

Run: `dev/e2e-observability.sh`
Expected: FAIL, because the stack is not running yet.

- [ ] **Step 3: Add the stack and the dashboard**

Prometheus scrapes each service's management port. Services run on the host, so the target is `host.docker.internal:<management port>`. Jaeger all-in-one receives OTLP on port 4318. The Grafana dashboard has these panels: request rate per service, p95 latency per service, 5xx rate, 429 count, JVM heap, Hikari active connections.

- [ ] **Step 4: Run it and confirm it passes**

Run: `dev/e2e-observability.sh` (after `dev/up.sh` and `docker compose --profile observability up -d`).
Expected: PASS, with a printed count of panels checked.

- [ ] **Step 5: Commit**

```bash
git add dev
git commit -m "obs: local Prometheus, Jaeger and Grafana profile with dashboard and e2e proof"
```

---

### Task 5: k6 load test with thresholds and a rate-limit probe

**Files:**
- Create: `dev/load/gateway.js`
- Create: `dev/load/README.md` (how to run, and what each scenario proves)

**Interfaces:**
- Consumes: the dev identity provider (`POST http://localhost:9100/token` with `{"email": ...}`) and the gateway on `localhost:8080`.
- Produces: a summary JSON per run, written to `dev/load/results/`.

- [ ] **Step 1: Write the script with thresholds**

Two scenarios:
- **steady:** 50 virtual users, 2 minutes, read endpoints through the gateway. Each virtual user signs in as its own generated test user, because the FREE plan's 120 requests per minute applies per user. Thresholds: p95 under 300 ms, failure rate under 1%.
- **rate-limit probe:** one user sends 200 requests in a burst. Thresholds: at least one 429, every 429 has `Retry-After`, zero 5xx.

- [ ] **Step 2: Smoke run and confirm it passes**

Run: `docker run --rm --network host -v "$PWD/dev/load:/load" grafana/k6 run --vus 1 --duration 10s /load/gateway.js`
Expected: all thresholds pass. This needs the owner's yes to pull `grafana/k6`.

- [ ] **Step 3: Commit**

```bash
git add dev/load
git commit -m "load: k6 steady and rate-limit scenarios with thresholds"
```

---

### Task 6: Baseline run and written report (gated on approval)

**Files:**
- Create: `docs/perf/2026-11-23-baseline.md`
- Create: `dev/load/results/` (ignored by git, except a `.gitkeep`)

**Interfaces:**
- Consumes: the full stack from Tasks 1 to 5.

- [ ] **Step 1: Run the full steady scenario and the rate-limit probe**

Run both scenarios on the dev stack. Record the machine (Mac model, RAM, Colima CPU and memory settings) and the exact commands.

- [ ] **Step 2: Write the report**

The report includes: the numbers (requests per second, p50, p95, p99, failure rate, 429 count), where the time goes (from the Jaeger traces for the slowest 1% of requests), and the limits of the test (one laptop, one instance per service, no real network). Say plainly that these are laptop numbers, not a claim about production capacity.

- [ ] **Step 3: Commit**

```bash
git add docs/perf dev/load/.gitignore
git commit -m "perf: baseline load report, with machine, commands and limits"
```

---

## Out of scope for this plan

- Multiple instances of each service, a load balancer, or Kafka partitioning. Those need the baseline numbers first, so they are a separate plan.
- Helm, kind, image scanning, Playwright, ZAP and the threat model. Those are later Phase 5 plans.

## Self-Review

**1. Spec coverage:** The spec's observability design and Phase 5 items for OpenTelemetry, Prometheus, Grafana and k6 load results are covered by Tasks 1 to 6. Items outside this slice are named as out of scope.

**2. Step scan:** Each test step names its assertions. Code steps name their files. The one verification step with an unspecified result (Task 3, Step 2) states the two outcomes and the action for each.

**3. Type consistency:** `MANAGEMENT_PORT`, `OTLP_TRACES_ENDPOINT`, `TRACING_SAMPLING` and `@LocalManagementPort` are used the same way across tasks.

**4. Review Focus:** Lines 1 to 3 are tested in Task 1. Line 4 is tested in Task 3. Line 5 is tested in Task 5.

**5. Proportion:** The plan is shorter than the spec sections it implements. Code blocks are limited to test bodies and config keys.
