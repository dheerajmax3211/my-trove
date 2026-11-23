package com.personalplatform.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.gateway.support.Backends;
import com.personalplatform.gateway.support.GatewayTestBase;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalManagementPort;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.reactive.server.WebTestClient;

/** Metrics live on a private management port; the main port stays closed to them. */
@ExtendWith(OutputCaptureExtension.class)
class ObservabilityExposureTest extends GatewayTestBase {

    private static final String TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";

    @LocalManagementPort
    int managementPort;

    private WebTestClient management() {
        return WebTestClient.bindToServer().baseUrl("http://localhost:" + managementPort).build();
    }

    @Test
    void metricsAreServedOnTheManagementPortOnly() {
        management().get().uri("/actuator/prometheus").exchange().expectStatus().isOk();
        management().get().uri("/actuator/health").exchange().expectStatus().isOk();
        assertThat(managementPort).isNotEqualTo(port);
        client.get().uri("/actuator/prometheus").exchange().expectStatus().value(s -> assertThat(s).isIn(401, 403, 404));
    }

    @Test
    void aSignedInUserCannotReadMetricsOnTheMainPort() {
        client.get().uri("/actuator/prometheus").header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER))
                .exchange().expectStatus().value(s -> assertThat(s).isNotEqualTo(200));
    }

    @Test
    void metricLabelsUseRouteTemplatesNotIds() {
        client.get().uri("/api/shared/v1/households/" + UUID.randomUUID())
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER)).exchange();
        String scrape = new String(management().get().uri("/actuator/prometheus").exchange()
                .expectStatus().isOk().expectBody().returnResult().getResponseBody());
        assertThat(scrape).contains("http_server_requests");
        // The routed request itself was instrumented: a gateway series exists for the shared route (routes have no
        // path template, so the route id is the label that names what was served).
        assertThat(scrape).containsPattern(
                "(?m)^http_client_requests_seconds_count\\{[^}]*http_status_code=\"200\"[^}]*spring_cloud_gateway_route_id=\"shared\"[^}]*\\} [1-9]");
        assertThat(scrape).doesNotContainPattern("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}");
    }

    @Test
    void logsCarryTheTraceIdAndNeverATokenValue(CapturedOutput output) {
        // The identity provider stub answers 500 for this credential, so the gateway logs a warning inside the request.
        client.get().uri("/api/auth/v1/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.BOOM))
                .header("traceparent", "00-" + TRACE_ID + "-00f067aa0ba902b7-01")
                .exchange();
        String logs = output.getAll();
        assertThat(logs).contains("token exchange failed");
        assertThat(logs).contains("[gateway," + TRACE_ID + ",");
        assertThat(logs).doesNotContain("Bearer ");
        assertThat(logs).doesNotContain(Backends.BOOM);
    }
}
