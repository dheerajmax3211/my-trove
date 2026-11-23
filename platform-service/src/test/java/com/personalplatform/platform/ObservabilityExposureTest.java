package com.personalplatform.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

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
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/** Metrics live on a private management port; the main port stays closed to them. */
@SpringBootTest(webEnvironment = RANDOM_PORT, properties = {"management.server.port=0",
        "logging.level.org.springframework.security.web.FilterChainProxy=DEBUG"})
@ExtendWith(OutputCaptureExtension.class)
class ObservabilityExposureTest extends AbstractPlatformTest {

    private static final String TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
    private static final String TOKEN_VALUE = "eyJhbGciOiJSUzI1NiJ9.platform-test-token-value.signature";

    @LocalServerPort int port;
    @LocalManagementPort int managementPort;

    private final HttpClient http = HttpClient.newHttpClient();

    private HttpResponse<String> fetch(int onPort, String path, String bearer) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + onPort + path));
        if (bearer != null) {
            request.header(HttpHeaders.AUTHORIZATION, "Bearer " + bearer);
        }
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
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
        assertThat(fetch(port, "/actuator/prometheus", TOKEN_VALUE).statusCode()).isNotEqualTo(200);
    }

    @Test
    void metricLabelsUseRouteTemplatesNotIds() throws Exception {
        mvc.perform(get("/v1/developer/apps/" + UUID.randomUUID())
                .with(jwt().jwt(j -> j.subject("firebase-alice").claim("uid", "alice"))
                        .authorities(new SimpleGrantedAuthority("apps:manage"))));
        String scrape = fetch(managementPort, "/actuator/prometheus", null).body();
        assertThat(scrape).contains("http_server_requests");
        assertThat(scrape).doesNotContainPattern("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}");
    }

    @Test
    void logsCarryTheTraceIdAndNeverATokenValue(CapturedOutput output) throws Exception {
        // Security's own debug line ("Securing GET ...") is written inside the request, so it carries the trace id.
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/v1/flags/evaluate"))
                .header("traceparent", "00-" + TRACE_ID + "-00f067aa0ba902b7-01")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + TOKEN_VALUE)
                .build();
        http.send(request, HttpResponse.BodyHandlers.ofString());
        String logs = output.getAll();
        assertThat(logs).contains("[platform-service," + TRACE_ID + ",");
        assertThat(logs).doesNotContain("Bearer ");
        assertThat(logs).doesNotContain(TOKEN_VALUE);
    }
}
