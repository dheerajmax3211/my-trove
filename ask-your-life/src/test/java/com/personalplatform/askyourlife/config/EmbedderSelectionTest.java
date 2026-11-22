package com.personalplatform.askyourlife.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.askyourlife.embedding.Embedder;
import com.personalplatform.askyourlife.embedding.HashingEmbedder;
import com.personalplatform.askyourlife.embedding.HttpEmbedder;
import java.time.Duration;
import org.junit.jupiter.api.Test;

/**
 * Which embedder the service runs with. {@code EMBEDDER_URL} unset: the local hashing stand-in (development default).
 * Set: the HTTP adapter speaks the OpenAI-style embeddings protocol to that URL, for example an Ollama server.
 */
class EmbedderSelectionTest {

    private static EmbedderProperties props(String url, int dimension) {
        return new EmbedderProperties(dimension,
                new EmbedderProperties.Http(url, "all-minilm", null, 8, Duration.ofSeconds(2)));
    }

    @Test
    void withoutAUrlTheDeterministicLocalEmbedderIsUsed() {
        Embedder embedder = new AppConfig().embedder(props("", 384));
        assertThat(embedder).isInstanceOf(HashingEmbedder.class);
        assertThat(embedder.dimension()).isEqualTo(384);
        assertThat(new AppConfig().embedder(props(null, 384))).isInstanceOf(HashingEmbedder.class);
    }

    @Test
    void withAUrlTheHttpAdapterIsUsedAndKeepsTheSchemaDimension() {
        Embedder embedder = new AppConfig().embedder(props("http://127.0.0.1:11434/v1/embeddings", 384));
        assertThat(embedder).isInstanceOf(HttpEmbedder.class);
        assertThat(embedder.dimension()).isEqualTo(384);
    }

    @Test
    void aModelWithAnotherDimensionIsRefusedAtStartup() {
        // nomic-embed-text produces 768 dimensions; the vector(384) column cannot hold it
        assertThatThrownBy(() -> new AppConfig().embedder(props("http://127.0.0.1:11434/v1/embeddings", 768)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("vector(384)");
    }
}
