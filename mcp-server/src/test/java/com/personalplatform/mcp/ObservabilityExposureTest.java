package com.personalplatform.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.micrometer.metrics.test.autoconfigure.AutoConfigureMetrics;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalManagementPort;
import org.springframework.test.context.TestPropertySource;

/** Metrics live on a private management port; the main port stays closed to them. Logs carry trace ids, never tokens. */
// Spring Boot turns metrics export off in tests; this test is about the real Prometheus scrape, so turn it on.
@AutoConfigureMetrics
@TestPropertySource(properties = "logging.level.org.springframework.security.web.FilterChainProxy=DEBUG")
@ExtendWith(OutputCaptureExtension.class)
class ObservabilityExposureTest extends McpTestBase {

    private static final String TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";

    @LocalManagementPort int managementPort;

    private HttpResponse<String> fetch(int onPort, String path, String token) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + onPort + path)).GET();
        if (token != null) {
            b.header("Authorization", "Bearer " + token);
        }
        return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void metricsAreServedOnTheManagementPortOnly() throws Exception {
        assertThat(fetch(managementPort, "/actuator/prometheus", null).statusCode()).isEqualTo(200);
        assertThat(fetch(managementPort, "/actuator/health", null).statusCode()).isEqualTo(200);
        assertThat(managementPort).isNotEqualTo(port);
        assertThat(fetch(port, "/actuator/prometheus", null).statusCode()).isIn(401, 403, 404);
        assertThat(fetch(port, "/actuator/prometheus", member("ann")).statusCode()).isNotEqualTo(200);
    }

    @Test
    void metricLabelsCarryNoIds() throws Exception {
        callTool(member("ann"), "home_pulse_appliance_status", "{\"applianceId\":\"0190f0a0-0000-7000-8000-000000000201\"}");
        String scrape = fetch(managementPort, "/actuator/prometheus", null).body();
        assertThat(scrape).contains("http_server_requests");
        assertThat(scrape).doesNotContainPattern("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}");
    }

    @Test
    void logsCarryTheTraceIdAndNeverATokenValue(CapturedOutput output) throws Exception {
        String token = member("ann");
        http.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/mcp"))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .header("traceparent", "00-" + TRACE_ID + "-00f067aa0ba902b7-01")
                .POST(HttpRequest.BodyPublishers.ofString("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}"))
                .build(), HttpResponse.BodyHandlers.ofString());
        String logs = output.getAll();
        assertThat(logs).contains("[mcp-server," + TRACE_ID + ",");
        assertThat(logs).doesNotContain("Bearer ");
        assertThat(logs).doesNotContain(token);
    }
}
