package com.personalplatform.homepulse;

import org.springframework.boot.micrometer.metrics.test.autoconfigure.AutoConfigureMetrics;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalManagementPort;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;

/**
 * Metrics live on a private management port; the main port stays closed to them.
 * Route for the label test: GET /v1/appliances/{id} (served by this service itself, called with a random UUID).
 */
// Spring Boot turns metrics export off in tests; this test is about the real Prometheus scrape, so turn it on.
@AutoConfigureMetrics
@SpringBootTest(webEnvironment = RANDOM_PORT, properties = {"management.server.port=0",
        "logging.level.org.springframework.security.web.FilterChainProxy=DEBUG"})
@ExtendWith(OutputCaptureExtension.class)
class ObservabilityExposureTest extends AbstractIntegrationTest {

    private static final String TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
    private static final String TOKEN_VALUE = "eyJhbGciOiJSUzI1NiJ9.home-pulse-test-token-value.signature";

    @LocalServerPort int port;
    @LocalManagementPort int managementPort;

    private final HttpClient http = HttpClient.newHttpClient();

    private HttpResponse<String> send(String method, int onPort, String path, String authorization, String traceparent) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + onPort + path))
                .method(method, HttpRequest.BodyPublishers.noBody());
        if (authorization != null) {
            request.header(HttpHeaders.AUTHORIZATION, authorization);
        }
        if (traceparent != null) {
            request.header("traceparent", traceparent);
        }
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> fetch(int onPort, String path, String authorization) throws Exception {
        return send("GET", onPort, path, authorization, null);
    }

    @Test
    void metricsAreServedOnTheManagementPortOnly() throws Exception {
        assertThat(fetch(managementPort, "/actuator/prometheus", null).statusCode()).isEqualTo(200);
        assertThat(fetch(managementPort, "/actuator/health", null).statusCode()).isEqualTo(200);
        assertThat(managementPort).isNotEqualTo(port);
        assertThat(fetch(port, "/actuator/prometheus", null).statusCode()).isIn(401, 403, 404);
    }

    @Test
    void aSignedInUserCannotReadMetricsOnTheMainPort() throws Exception {
        assertThat(fetch(port, "/actuator/prometheus", bearer(ALICE)).statusCode()).isNotEqualTo(200);
    }

    @Test
    void metricLabelsUseRouteTemplatesNotIds() throws Exception {
        send("GET", port, "/v1/appliances/" + UUID.randomUUID() + "", bearer(ALICE), null);
        String scrape = fetch(managementPort, "/actuator/prometheus", null).body();
        assertThat(scrape).contains("http_server_requests");
        // The series for the request just made carries the route template; without it the UUID check below proves nothing.
        assertThat(scrape).contains("uri=\"/v1/appliances/{id}\"");
        assertThat(scrape).doesNotContainPattern("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}");
    }

    @Test
    void logsCarryTheTraceIdAndNeverATokenValue(CapturedOutput output) throws Exception {
        // Security's own debug line ("Securing GET ...") is written inside the request, so it carries the trace id.
        send("GET", port, "/v1/appliances", "Bearer " + TOKEN_VALUE, "00-" + TRACE_ID + "-00f067aa0ba902b7-01");
        String logs = output.getAll();
        assertThat(logs).contains("[home-pulse," + TRACE_ID + ",");
        assertThat(logs).doesNotContain("Bearer ");
        assertThat(logs).doesNotContain(TOKEN_VALUE);
    }
}
