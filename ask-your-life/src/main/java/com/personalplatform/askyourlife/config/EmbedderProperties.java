package com.personalplatform.askyourlife.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Embedder selection ({@code app.embedder.*}).
 *
 * <p>{@code kind} ({@code EMBEDDER}): {@code model2vec} (default: the local potion-base-2M model, pure Java),
 * {@code hashing} (the deterministic lexical stand-in) or {@code http} (an OpenAI-style embeddings service at
 * {@code http.url}). Blank keeps the earlier behaviour: {@code http} when {@code http.url} is set, else
 * {@code model2vec}. If the model2vec files are missing or unreadable the service falls back to hashing with a WARN
 * and reports it in {@code /actuator/health}; it never fails to start because of them.
 */
@ConfigurationProperties(prefix = "app.embedder")
public record EmbedderProperties(@DefaultValue("384") int dimension, String kind, Http http, Model2vec model2vec) {

    public EmbedderProperties {
        http = http == null ? new Http(null, null, null, 32, Duration.ofSeconds(15)) : http;
        model2vec = model2vec == null ? new Model2vec(null, null) : model2vec;
    }

    public enum Kind { MODEL2VEC, HASHING, HTTP }

    public Kind resolvedKind() {
        if (kind == null || kind.isBlank()) {
            return http.enabled() ? Kind.HTTP : Kind.MODEL2VEC;
        }
        try {
            return Kind.valueOf(kind.strip().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("app.embedder.kind (EMBEDDER) must be model2vec, hashing or http, was '"
                    + kind + "'");
        }
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

    /**
     * @param dir  directory holding {@code model.safetensors} and {@code tokenizer.json} ({@code EMBEDDER_MODEL_DIR})
     * @param name recorded with every indexed document, so a different model triggers re-embedding
     */
    public record Model2vec(
            @DefaultValue("model/potion-base-2M") String dir,
            @DefaultValue("potion-base-2M@389b9f6") String name) {

        public Model2vec {
            dir = dir == null || dir.isBlank() ? "model/potion-base-2M" : dir;
            name = name == null || name.isBlank() ? "potion-base-2M@389b9f6" : name;
        }
    }
}
