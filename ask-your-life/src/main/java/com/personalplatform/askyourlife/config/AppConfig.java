package com.personalplatform.askyourlife.config;

import com.personalplatform.askyourlife.chunking.Chunker;
import com.personalplatform.askyourlife.embedding.Embedder;
import com.personalplatform.askyourlife.embedding.HashingEmbedder;
import com.personalplatform.askyourlife.embedding.HttpEmbedder;
import java.net.URI;
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
    Embedder embedder(EmbedderProperties props) {
        if (props.dimension() != SCHEMA_EMBEDDING_DIMENSION) {
            throw new IllegalStateException("app.embedder.dimension=" + props.dimension()
                    + " but the schema column is vector(" + SCHEMA_EMBEDDING_DIMENSION + ")");
        }
        EmbedderProperties.Http http = props.http();
        if (http.enabled()) {
            LOG.info("Using HTTP embedder at {} (batch size {})", http.url(), http.batchSize());
            return new HttpEmbedder(URI.create(http.url()), http.model(), http.apiKey(), props.dimension(),
                    http.batchSize(), http.timeout());
        }
        LOG.info("Using local hashing embedder (development default; lexical, not a language model)");
        return new HashingEmbedder(props.dimension());
    }
}
