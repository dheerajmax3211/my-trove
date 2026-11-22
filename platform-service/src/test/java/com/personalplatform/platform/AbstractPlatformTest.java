package com.personalplatform.platform;

import com.personalplatform.platform.usage.PrincipalType;
import com.personalplatform.platform.usage.UsageEvent;
import com.personalplatform.platform.usage.UsageRepository;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.jooq.DSLContext;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.json.JsonMapper;

/**
 * One Spring context, one TimescaleDB container and one Kafka container shared by every integration test (a second
 * context would start a second consumer in the same group and rebalance the first one mid-test). Each test starts from
 * an empty {@code usage_events} table and uses timestamps in 2031 and later.
 *
 * <p>Continuous aggregates: a refresh moves the view's watermark, and raw rows behind the watermark stay invisible to the
 * real-time view until the next refresh. Only {@code QuotaTest.usedAddsTheDailyAggregateAndTodaysRawRows} refreshes, and
 * only inside January 2031; every other test keeps its data after 2031-02-01 so it is never behind a watermark.
 */
@Import(TestSupportConfig.class)
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "app.internal.api-key=test-internal-key",
        "app.usage.retry-initial=100ms",
        "app.usage.retry-max=300ms",
        "app.webhooks.worker-enabled=false"})
abstract class AbstractPlatformTest {

    static final PostgreSQLContainer TIMESCALE = new PostgreSQLContainer(
            DockerImageName.parse("timescale/timescaledb:2.32.0-pg16").asCompatibleSubstituteFor("postgres"));
    static final KafkaContainer KAFKA = new KafkaContainer(DockerImageName.parse("apache/kafka:latest"));

    static {
        TIMESCALE.start();
        KAFKA.start();
    }

    @DynamicPropertySource
    static void containers(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", TIMESCALE::getJdbcUrl);
        registry.add("spring.datasource.username", TIMESCALE::getUsername);
        registry.add("spring.datasource.password", TIMESCALE::getPassword);
        registry.add("spring.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
    }

    @Autowired protected MockMvc mvc;
    @Autowired protected DSLContext dsl;
    @Autowired protected JsonMapper json;
    @Autowired protected TestSupportConfig.MutableClock clock;
    @MockitoSpyBean protected UsageRepository usageRepository;

    @BeforeEach
    void cleanSlate() {
        clock.set(TestSupportConfig.START);
        dsl.execute("delete from platform.usage_events");
    }

    protected long rowCount(UUID eventId) {
        return ((Number) dsl.fetchValue("select count(*) from platform.usage_events where event_id = ?", eventId)).longValue();
    }

    /** Stores one event straight through the repository (no Kafka), as a USER principal on plan FREE. */
    protected void store(String principalId, String ts, String service, int status, int latencyMs) {
        store(PrincipalType.USER, principalId, ts, service, status, latencyMs, false, "FREE");
    }

    protected void store(PrincipalType type, String principalId, String ts, String service, int status, int latencyMs,
                         boolean rateLimited, String plan) {
        usageRepository.insertIdempotent(new UsageEvent(UUID.randomUUID(), Instant.parse(ts), null, type, principalId, null,
                service, "GET", "/v1/items/{id}", status, latencyMs, 0, 0, plan, rateLimited));
    }

    /** A valid usage event as the gateway would publish it (design 5.4). */
    protected static Map<String, Object> event(UUID id, Instant ts, String principalId, String service, int status, int latencyMs) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("eventId", id.toString());
        m.put("ts", ts.toString());
        m.put("requestId", "req-" + id);
        m.put("principalType", "USER");
        m.put("principalId", principalId);
        m.put("appId", null);
        m.put("service", service);
        m.put("method", "GET");
        m.put("routeTemplate", "/v1/items/{id}");
        m.put("status", status);
        m.put("latencyMs", latencyMs);
        m.put("requestBytes", 120);
        m.put("responseBytes", 2048);
        m.put("plan", "FREE");
        m.put("rateLimited", false);
        return m;
    }
}
