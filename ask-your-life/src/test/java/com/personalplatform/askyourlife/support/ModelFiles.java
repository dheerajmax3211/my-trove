package com.personalplatform.askyourlife.support;

import static org.junit.jupiter.api.Assertions.fail;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.personalplatform.askyourlife.embedding.Model2VecEmbedder;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Locates the Model2Vec files for tests: system property {@code model2vec.dir} (set by the pom), else
 * {@code model/potion-base-2M} under the module. Fetch them with {@code ask-your-life/model/fetch-model.sh} or
 * {@code ./mvnw -pl ask-your-life -am verify -Dfetch-model}. Tests that need the model are skipped when it is absent,
 * unless {@code -Dmodel2vec.required=true} (then they fail), which is what CI sets together with {@code -Dfetch-model}.
 */
public final class ModelFiles {

    public static final String MODEL_NAME = "potion-base-2M@389b9f6";

    private static Model2VecEmbedder cached;

    private ModelFiles() {}

    public static Path dir() {
        return Path.of(System.getProperty("model2vec.dir", "model/potion-base-2M")).toAbsolutePath();
    }

    public static boolean present() {
        return Files.isRegularFile(dir().resolve("model.safetensors")) && Files.isRegularFile(dir().resolve("tokenizer.json"));
    }

    /** Skips (or fails, with model2vec.required=true) the calling test when the model files are absent. */
    public static void assumePresent() {
        if (present()) {
            return;
        }
        String msg = "Model2Vec files not found in " + dir() + " (run ask-your-life/model/fetch-model.sh)";
        if (Boolean.getBoolean("model2vec.required")) {
            fail(msg);
        }
        assumeTrue(false, msg);
    }

    public static synchronized Model2VecEmbedder embedder() {
        assumePresent();
        if (cached == null) {
            try {
                cached = Model2VecEmbedder.load(dir(), 384, MODEL_NAME);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
        return cached;
    }
}
