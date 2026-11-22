package com.personalplatform.gateway.metering;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

import com.personalplatform.gateway.support.Backends;
import com.personalplatform.gateway.support.GatewayTestBase;
import com.personalplatform.gateway.support.UsageTopicReader;
import com.personalplatform.gateway.support.UsageTopicReader.Event;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.EntityExchangeResult;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest(webEnvironment = RANDOM_PORT, properties = {"gateway.metering.enabled=true"})
class UsageMeteringTest extends GatewayTestBase {

    static final KafkaContainer KAFKA = new KafkaContainer(DockerImageName.parse("apache/kafka:latest"));

    static {
        KAFKA.start();
    }

    private static UsageTopicReader reader;

    @DynamicPropertySource
    static void kafka(DynamicPropertyRegistry registry) {
        registry.add("gateway.metering.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
    }

    @AfterAll
    static void stopReader() {
        if (reader != null) {
            reader.close();
        }
    }

    private static synchronized UsageTopicReader reader() {
        if (reader == null) {
            reader = new UsageTopicReader(KAFKA.getBootstrapServers());
        }
        return reader;
    }

    /** The event for one request, found by its request id. */
    private Event eventFor(EntityExchangeResult<byte[]> response) {
        String requestId = response.getResponseHeaders().getFirst("X-Request-Id");
        assertThat(requestId).isNotBlank();
        long deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
        List<Event> all = List.of();
        while (System.nanoTime() < deadline) {
            all = reader().await(Integer.MAX_VALUE, Duration.ofMillis(500));
            List<Event> match = all.stream().filter(e -> requestId.equals(e.text("requestId"))).toList();
            if (!match.isEmpty()) {
                assertThat(match).as("exactly one event per request").hasSize(1);
                return match.get(0);
            }
        }
        throw new AssertionError("no usage event for request " + requestId + " among " + all.size());
    }

    private EntityExchangeResult<byte[]> get(String uri, String credential) {
        var spec = client.get().uri(uri);
        if (credential != null) {
            spec = spec.header(HttpHeaders.AUTHORIZATION, bearer(credential));
        }
        return spec.exchange().expectBody().returnResult();
    }

    @Test
    void aProxiedRequestProducesOneEventWithTheDesignFields() {
        EntityExchangeResult<byte[]> response = client.post()
                .uri("/api/waiting-on/v1/items/0190c3f0-aaaa-7bbb-8ccc-0123456789ab?expand=all")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER))
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"a\":1}")
                .exchange().expectStatus().isOk().expectBody().returnResult();

        Event e = eventFor(response);

        assertThat(e.key()).isEqualTo("alice");
        assertThat(UUID.fromString(e.text("eventId")).version()).isEqualTo(7);
        assertThat(Instant.parse(e.text("ts"))).isBetween(Instant.now().minusSeconds(120), Instant.now().plusSeconds(5));
        assertThat(e.text("requestId")).isEqualTo(response.getResponseHeaders().getFirst("X-Request-Id"));
        assertThat(e.text("principalType")).isEqualTo("USER");
        assertThat(e.text("principalId")).isEqualTo("alice");
        assertThat(e.get("appId")).isNull();
        assertThat(e.text("service")).isEqualTo("waiting-on");
        assertThat(e.text("method")).isEqualTo("POST");
        assertThat(e.text("routeTemplate")).isEqualTo("/v1/items");
        assertThat(e.number("status")).isEqualTo(200);
        assertThat(e.number("latencyMs")).isBetween(0L, 30_000L);
        assertThat(e.number("requestBytes")).isEqualTo(7);
        assertThat(e.number("responseBytes")).isEqualTo(response.getResponseBodyContent().length).isPositive();
        assertThat(e.text("plan")).isEqualTo("FREE");
        assertThat(e.get("rateLimited")).isEqualTo(false);
        assertThat(e.value().keySet()).containsExactlyInAnyOrder("eventId", "ts", "requestId", "principalType",
                "principalId", "appId", "service", "method", "routeTemplate", "status", "latencyMs", "requestBytes",
                "responseBytes", "plan", "rateLimited");
    }

    @Test
    void forbiddenAndUnauthorizedOutcomesAreRecorded() {
        Event forbidden = eventFor(get("/api/family-treasury/v1/accounts/42", Backends.NO_PRODUCTS));
        assertThat(forbidden.number("status")).isEqualTo(403);
        assertThat(forbidden.text("principalType")).isEqualTo("USER");
        assertThat(forbidden.key()).as("rejected by the route policy, but the token was valid").isEqualTo("carol");
        assertThat(forbidden.text("service")).isEqualTo("family-treasury");
        assertThat(forbidden.text("routeTemplate")).isEqualTo("/v1/accounts");

        Event unauthorized = eventFor(get("/api/waiting-on/v1/items", null));
        assertThat(unauthorized.number("status")).isEqualTo(401);
        assertThat(unauthorized.text("principalType")).isEqualTo("ANON");
        assertThat(unauthorized.key()).matches("anon:[0-9a-f]{16}");
        assertThat(unauthorized.text("principalId")).isEqualTo(unauthorized.key());
        assertThat(unauthorized.key()).doesNotContain("127.0.0.1");
    }

    @Test
    void aRateLimitedRequestIsRecordedAsSuch() {
        backends.platform().handler(r -> r.path().startsWith("/internal/")
                ? backends.internal(r, "[{\"plan\":\"FREE\",\"requestsPerMinute\":1,\"requestsPerMonth\":10000}]",
                        "{\"plan\":\"FREE\",\"monthlyLimit\":10000,\"used\":0}")
                : backends.platform().echo(r));
        planLimits().reloadNow();

        get("/api/waiting-on/v1/items", "u|limited|FREE|products:use");
        Event e = eventFor(get("/api/waiting-on/v1/items", "u|limited|FREE|products:use"));

        assertThat(e.number("status")).isEqualTo(429);
        assertThat(e.get("rateLimited")).isEqualTo(true);
        assertThat(e.text("principalId")).isEqualTo("limited");
        assertThat(e.number("responseBytes")).isPositive();
    }

    @Test
    void theRouteTemplateNeverContainsAnId() {
        for (String path : List.of(
                "/api/waiting-on/v1/items/0190c3f0-aaaa-7bbb-8ccc-0123456789ab/comments/77",
                "/api/shared/v1/files/0190c3f0-aaaa-7bbb-8ccc-0123456789ab/download-link",
                "/api/waiting-on/v1/9f8e7d6c5b4a39281706/x",
                "/api/consent/v1/owner/grants/12345?x=1")) {
            Event e = eventFor(get(path, Backends.MEMBER));
            assertThat(e.text("routeTemplate")).as(path).doesNotContainPattern("[0-9a-f]{8}-[0-9a-f]{4}")
                    .doesNotContainPattern("\\d{3,}").doesNotContain("?").hasSizeLessThan(40);
        }
    }

    @Test
    void passthroughRequestsAreAnonymousOrConsentClientsAndUseTheRulePatternAsTheirTemplate() {
        EntityExchangeResult<byte[]> device = client.post().uri("/api/home-pulse/v1/ingest/readings")
                .header(HttpHeaders.AUTHORIZATION, "Bearer hpd_device").exchange().expectBody().returnResult();
        Event e = eventFor(device);
        assertThat(e.text("principalType")).isEqualTo("ANON");
        assertThat(e.key()).startsWith("anon:");
        assertThat(e.text("routeTemplate")).isEqualTo("/v1/ingest/**");
        assertThat(e.text("service")).isEqualTo("home-pulse");

        Event consent = eventFor(client.post().uri("/api/consent/v1/oauth/token").exchange().expectBody().returnResult());
        assertThat(consent.text("principalType")).isEqualTo("CONSENT_CLIENT");
        assertThat(consent.text("routeTemplate")).isEqualTo("/v1/oauth/**");
    }

    @Test
    void serviceTokensAreApiKeyPrincipalsWithTheirAppId() {
        Event e = eventFor(get("/api/platform/v1/ping", "svc|reports|PRO"));

        assertThat(e.text("principalType")).isEqualTo("API_KEY");
        assertThat(e.text("principalId")).isEqualTo("app:reports");
        assertThat(e.text("appId")).isEqualTo("reports");
        assertThat(e.text("plan")).isEqualTo("PRO");
        assertThat(e.key()).isEqualTo("app:reports");
    }

    @Test
    void credentialsNeverAppearInEvents() {
        Event e = eventFor(get("/api/waiting-on/v1/items?token=abc", Backends.MEMBER));

        assertThat(e.value().toString()).doesNotContain("Bearer").doesNotContain("abc").doesNotContain(Backends.MEMBER)
                .doesNotContain("eyJ");
    }

    /** W4 item 5: an API key call is metered like any other call, as an API_KEY principal with its app. */
    @Test
    void apiKeyCallsAreMeteredAsApiKeyPrincipals() {
        String appId = "0190f0a0-0000-7000-8000-00000000000a";
        var response = get("/api/platform/v1/usage/me", "svc|" + appId + "|FREE|usage:read:self");
        assertThat(response.getStatus().value()).isEqualTo(200);

        Event event = eventFor(response);
        assertThat(event.text("principalType")).isEqualTo("API_KEY");
        assertThat(event.text("principalId")).isEqualTo("app:" + appId);
        assertThat(event.text("appId")).isEqualTo(appId);
        assertThat(event.text("plan")).isEqualTo("FREE");
    }
}
