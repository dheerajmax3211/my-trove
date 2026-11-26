package com.personalplatform.askyourlife.config;

import com.personalplatform.askyourlife.chunking.Chunker;
import com.personalplatform.askyourlife.embedding.Embedder;
import com.personalplatform.askyourlife.embedding.HashingEmbedder;
import com.personalplatform.askyourlife.embedding.HttpEmbedder;
import com.personalplatform.askyourlife.embedding.Model2VecEmbedder;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class AppConfig {

    /** Dimension of the {@code embedding} column in the schema. */
    public static final int SCHEMA_EMBEDDING_DIMENSION = 384;

    private static final Logger LOG = LoggerFactory.getLogger(AppConfig.class);

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    Chunker chunker(IngestProperties props) {
        return new Chunker(props.chunkMaxTokens(), props.chunkOverlapTokens());
    }

    @Bean
    EmbedderSelection embedderSelection(EmbedderProperties props) {
        return select(props);
    }

    @Bean
    Embedder embedder(EmbedderSelection selection) {
        return selection.embedder();
    }

    /** Picks the embedder; model2vec problems fall back to hashing (WARN), configuration errors fail startup. */
    public static EmbedderSelection select(EmbedderProperties props) {
        if (props.dimension() != SCHEMA_EMBEDDING_DIMENSION) {
            throw new IllegalStateException("app.embedder.dimension=" + props.dimension()
                    + " but the schema column is vector(" + SCHEMA_EMBEDDING_DIMENSION + ")");
        }
        EmbedderProperties.Kind kind = props.resolvedKind();
        switch (kind) {
            case HTTP -> {
                EmbedderProperties.Http http = props.http();
                if (!http.enabled()) {
                    throw new IllegalStateException("EMBEDDER=http needs EMBEDDER_URL (app.embedder.http.url)");
                }
                LOG.info("Using HTTP embedder at {} (batch size {})", http.url(), http.batchSize());
                return new EmbedderSelection(kind, new HttpEmbedder(URI.create(http.url()), http.model(),
                        http.apiKey(), props.dimension(), http.batchSize(), http.timeout()), null);
            }
            case HASHING -> {
                LOG.info("Using local hashing embedder (lexical stand-in, not a language model)");
                return new EmbedderSelection(kind, new HashingEmbedder(props.dimension()), null);
            }
            default -> {
                Path dir = Path.of(props.model2vec().dir()).toAbsolutePath();
                String reason;
                if (!Files.isRegularFile(dir.resolve("model.safetensors")) || !Files.isRegularFile(dir.resolve("tokenizer.json"))) {
                    reason = "model files not found in " + dir + " (run ask-your-life/model/fetch-model.sh)";
                } else {
                    try {
                        Model2VecEmbedder m = Model2VecEmbedder.load(dir, props.dimension(), props.model2vec().name());
                        LOG.info("Using Model2Vec embedder {} from {}", m.id(), dir);
                        return new EmbedderSelection(kind, m, null);
                    } catch (Exception e) {
                        reason = "could not load the model from " + dir + ": " + e.getMessage();
                    }
                }
                LOG.warn("!!! EMBEDDER=model2vec requested but {}. FALLING BACK to the lexical hashing embedder: "
                        + "semantic search will not understand synonyms. See /actuator/health (embedder).", reason);
                return new EmbedderSelection(kind, new HashingEmbedder(props.dimension()), reason);
            }
        }
    }
}
