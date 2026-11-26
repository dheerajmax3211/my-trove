package com.personalplatform.askyourlife.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.askyourlife.embedding.HashingEmbedder;
import com.personalplatform.askyourlife.embedding.HttpEmbedder;
import com.personalplatform.askyourlife.embedding.Model2VecEmbedder;
import com.personalplatform.askyourlife.support.ModelFiles;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.health.contributor.Status;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

/**
 * Which embedder the service runs with: {@code EMBEDDER=model2vec} (default), {@code hashing} or {@code http};
 * missing model files fall back to hashing loudly, never crash.
 */
@ExtendWith(OutputCaptureExtension.class)
class EmbedderSelectionTest {

    private static EmbedderProperties props(String kind, String url, int dimension, String modelDir) {
        return new EmbedderProperties(dimension, kind,
                new EmbedderProperties.Http(url, "all-minilm", null, 8, Duration.ofSeconds(2)),
                new EmbedderProperties.Model2vec(modelDir, null));
    }

    @Test
    void model2vecIsTheDefaultWhenTheFilesArePresent() {
        ModelFiles.assumePresent();
        EmbedderSelection s = AppConfig.select(props(null, "", 384, ModelFiles.dir().toString()));
        assertThat(s.requested()).isEqualTo(EmbedderProperties.Kind.MODEL2VEC);
        assertThat(s.embedder()).isInstanceOf(Model2VecEmbedder.class);
        assertThat(s.fallback()).isFalse();
        assertThat(s.embedder().dimension()).isEqualTo(384);
    }

    @Test
    void missingModelFilesFallBackToHashingWithALoudWarningAndHealthSaysSo(@TempDir Path empty, CapturedOutput out) {
        EmbedderSelection s = AppConfig.select(props("model2vec", null, 384, empty.toString()));
        assertThat(s.embedder()).isInstanceOf(HashingEmbedder.class);
        assertThat(s.fallback()).isTrue();
        assertThat(s.fallbackReason()).contains("model files not found");
        assertThat(out.getAll()).contains("WARN").contains("FALLING BACK");

        var health = new EmbedderHealthIndicator(s).health();
        assertThat(health.getStatus()).isEqualTo(Status.UP);
        assertThat(health.getDetails()).containsEntry("fallback", true).containsEntry("requested", "model2vec")
                .containsEntry("active", "hashing-v1:384").containsKey("fallbackReason");
    }

    @Test
    void corruptModelFilesAlsoFallBack(@TempDir Path dir) throws IOException {
        Files.writeString(dir.resolve("model.safetensors"), "not a model");
        Files.writeString(dir.resolve("tokenizer.json"), "{}");
        EmbedderSelection s = AppConfig.select(props(null, null, 384, dir.toString()));
        assertThat(s.embedder()).isInstanceOf(HashingEmbedder.class);
        assertThat(s.fallbackReason()).contains("could not load");
    }

    @Test
    void hashingCanBeChosenExplicitly() {
        EmbedderSelection s = AppConfig.select(props("hashing", null, 384, "/nonexistent"));
        assertThat(s.embedder()).isInstanceOf(HashingEmbedder.class);
        assertThat(s.fallback()).isFalse();
        assertThat(new EmbedderHealthIndicator(s).health().getDetails()).containsEntry("fallback", false);
    }

    @Test
    void withAUrlAndNoKindTheHttpAdapterIsUsedAndKeepsTheSchemaDimension() {
        EmbedderSelection s = AppConfig.select(props(null, "http://127.0.0.1:11434/v1/embeddings", 384, "/nonexistent"));
        assertThat(s.embedder()).isInstanceOf(HttpEmbedder.class);
        assertThat(s.embedder().dimension()).isEqualTo(384);
        assertThat(AppConfig.select(props("HTTP", "http://127.0.0.1:1/v1/embeddings", 384, "x")).embedder())
                .isInstanceOf(HttpEmbedder.class);
    }

    @Test
    void misconfigurationIsRefusedAtStartup() {
        // nomic-embed-text produces 768 dimensions; the vector(384) column cannot hold it
        assertThatThrownBy(() -> AppConfig.select(props(null, "http://127.0.0.1:11434/v1/embeddings", 768, "x")))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("vector(384)");
        assertThatThrownBy(() -> AppConfig.select(props("http", "", 384, "x")))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("EMBEDDER_URL");
        assertThatThrownBy(() -> AppConfig.select(props("onnx", "", 384, "x")))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("model2vec, hashing or http");
    }
}
