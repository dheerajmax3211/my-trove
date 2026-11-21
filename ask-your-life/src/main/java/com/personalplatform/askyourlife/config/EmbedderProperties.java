package com.personalplatform.askyourlife.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Embedder selection ({@code app.embedder.*}). With {@code app.embedder.http.url} set the HTTP embedder is used,
 * otherwise the deterministic local hashing embedder.
 */
@ConfigurationProperties(prefix = "app.embedder")
public record EmbedderProperties(@DefaultValue("384") int dimension, Http http) {

    public EmbedderProperties {
        http = http == null ? new Http(null, null, null, 32, Duration.ofSeconds(15)) : http;
    }

    public record Http(
            String url,
            String model,
            String apiKey,
            @DefaultValue("32") int batchSize,
            @DefaultValue("15s") Duration timeout) {

        public boolean enabled() {
            return url != null && !url.isBlank();
        }
    }
}
