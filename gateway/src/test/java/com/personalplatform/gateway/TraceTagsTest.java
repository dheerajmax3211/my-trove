package com.personalplatform.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.gateway.support.Backends;
import com.personalplatform.gateway.support.GatewayTestBase;
import io.micrometer.common.KeyValue;
import io.micrometer.observation.Observation;
import io.micrometer.observation.ObservationHandler;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;

/** Spans are built from observation tags, so every tag of every finished observation is checked for credentials. */
@Import(TraceTagsTest.Spy.class)
class TraceTagsTest extends GatewayTestBase {

    static final List<String> TAGS = new CopyOnWriteArrayList<>();

    @TestConfiguration
    static class Spy {
        @Bean
        ObservationHandler<Observation.Context> tagSpy() {
            return new ObservationHandler<>() {
                @Override
                public boolean supportsContext(Observation.Context context) {
                    return true;
                }

                @Override
                public void onStop(Observation.Context context) {
                    for (KeyValue kv : context.getAllKeyValues()) {
                        TAGS.add(context.getName() + " " + kv.getKey() + "=" + kv.getValue());
                    }
                }
            };
        }
    }

    @Test
    void aQueryStringTokenNeverReachesAnyObservationTag() {
        TAGS.clear();
        client.get().uri("/api/shared/v1/files/download?token=SECRET123&client_secret=SECRET456")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER)).exchange();
        client.get().uri("/api/auth/v1/me?q=SECRET789").header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER)).exchange();

        assertThat(TAGS).as("the request was observed").anyMatch(t -> t.contains("/api/shared/v1/files/download"));
        assertThat(TAGS).noneMatch(t -> t.contains("SECRET123") || t.contains("SECRET456"));
        assertThat(TAGS).noneMatch(t -> t.contains("Bearer "));
        assertThat(TAGS).noneMatch(t -> t.contains("token="));
    }
}
