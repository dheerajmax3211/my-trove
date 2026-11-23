package com.personalplatform.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.gateway.support.Backends;
import com.personalplatform.gateway.support.GatewayTestBase;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** An unreachable trace backend must not slow the requests the gateway serves. */
class TelemetryFailureTest extends GatewayTestBase {

    @DynamicPropertySource
    static void closedTraceBackend(DynamicPropertyRegistry registry) {
        registry.add("management.otlp.tracing.endpoint", () -> "http://localhost:1/v1/traces");
        registry.add("management.tracing.sampling.probability", () -> "1.0");
    }

    @Test
    void requestsStayFastWhenTheTraceBackendIsDown() {
        List<Long> millis = new ArrayList<>();
        for (int i = 0; i < 50; i++) {
            long start = System.nanoTime();
            client.get().uri("/api/auth/v1/me")
                    .header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER))
                    .exchange().expectStatus().isOk();
            millis.add((System.nanoTime() - start) / 1_000_000);
        }
        assertThat(percentile(millis, 95)).isLessThan(500);
    }

    private static long percentile(List<Long> values, int p) {
        List<Long> sorted = new ArrayList<>(values);
        Collections.sort(sorted);
        int index = (int) Math.ceil(p / 100.0 * sorted.size()) - 1;
        return sorted.get(Math.max(0, Math.min(sorted.size() - 1, index)));
    }
}
