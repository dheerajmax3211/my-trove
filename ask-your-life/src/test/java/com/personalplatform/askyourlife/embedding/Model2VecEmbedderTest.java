package com.personalplatform.askyourlife.embedding;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.personalplatform.askyourlife.support.ModelFiles;
import java.util.Arrays;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Test;

/**
 * The real potion-base-2M model loaded in pure Java. Reference values were computed independently with a separate
 * script that reads the safetensors file with struct unpacking and averages the rows of the token ids.
 */
class Model2VecEmbedderTest {

    @Test
    void loadsThePinnedModelAndPadsTo384() {
        Model2VecEmbedder e = ModelFiles.embedder();
        assertThat(e.modelDimension()).isEqualTo(64);
        assertThat(e.dimension()).isEqualTo(384);
        assertThat(e.id()).isEqualTo("model2vec:potion-base-2M@389b9f6:64->384");
        float[] v = e.embed("Receipt for the new fridge");
        assertThat(v).hasSize(384);
        for (int i = 64; i < 384; i++) {
            assertThat(v[i]).isZero();
        }
        assertThat(norm(v)).isCloseTo(1.0, within(1e-5));
    }

    @Test
    void embeddingIsTheNormalisedMeanOfTheTokenRowsLikeModel2Vec() {
        Model2VecEmbedder e = ModelFiles.embedder();
        // "Hello, World!" -> ids 6598 16 1094 5; independent reference: mean of those rows, L2-normalised
        float[] v = e.embed("Hello, World!");
        double[] expected = {-0.073441, -0.172353, -0.291938, 0.152067, 0.053297, 0.282775};
        for (int i = 0; i < expected.length; i++) {
            assertThat((double) v[i]).isCloseTo(expected[i], within(1e-5));
        }
        // a single token is its own (normalised) row: "receipt" = id 23312
        float[] r = e.embed("receipt");
        double[] row = {-0.113579, 0.382622, -0.02511, 0.001005, -0.049032, 0.155838};
        for (int i = 0; i < row.length; i++) {
            assertThat((double) r[i]).isCloseTo(row[i], within(1e-5));
        }
    }

    @Test
    void unknownTokensAreIgnoredAndCaseAndAccentsDoNotMatter() {
        Model2VecEmbedder e = ModelFiles.embedder();
        assertThat(e.embed("receipt ☃")).containsExactly(e.embed("receipt"));
        assertThat(e.embed("RÉCEIPT")).containsExactly(e.embed("receipt"));
        assertThat(e.embedAll(List.of("a", "b"))).hasSize(2);
    }

    @Test
    void aTextWithNoKnownTokenIsAUnitVectorOrthogonalToEveryEmbedding() {
        Model2VecEmbedder e = ModelFiles.embedder();
        float[] empty = e.embed("");
        assertThat(empty[64]).isEqualTo(1f);
        assertThat(norm(empty)).isEqualTo(1.0);
        assertThat(e.embed("☃☃")).containsExactly(empty);
        assertThat(Embedder.cosine(empty, e.embed("rent"))).isZero();
    }

    @Test
    void itKnowsRelatedWordsThatShareNoLetters() {
        Model2VecEmbedder e = ModelFiles.embedder();
        double carAutomobile = Embedder.cosine(e.embed("car"), e.embed("automobile"));
        double carBanana = Embedder.cosine(e.embed("car"), e.embed("banana"));
        double fridge = Embedder.cosine(e.embed("fridge"), e.embed("refrigerator"));
        double fridgeRent = Embedder.cosine(e.embed("fridge"), e.embed("rent"));
        assertThat(carAutomobile).isGreaterThan(carBanana + 0.1);
        assertThat(fridge).isGreaterThan(fridgeRent + 0.1);
        // the hashing stand-in sees no relation between words that share no letters
        HashingEmbedder h = new HashingEmbedder(384);
        assertThat(Embedder.cosine(h.embed("car"), h.embed("automobile"))).isLessThan(0.2);
    }

    @Test
    void longTextsUseTheFirst512KnownTokens() {
        Model2VecEmbedder e = ModelFiles.embedder();
        String head = "rent ".repeat(512);
        assertThat(e.embed(head + "banana banana banana")).containsExactly(e.embed(head));
    }

    /** Zero padding leaves dot products and norms, hence cosine similarity, unchanged. */
    @Test
    void zeroPaddingPreservesCosineSimilarity() {
        Random rnd = new Random(42);
        for (int trial = 0; trial < 200; trial++) {
            float[] a = new float[64];
            float[] b = new float[64];
            for (int i = 0; i < 64; i++) {
                a[i] = (float) rnd.nextGaussian();
                b[i] = (float) rnd.nextGaussian();
            }
            double unpadded = Embedder.cosine(a, b);
            double padded = Embedder.cosine(Arrays.copyOf(a, 384), Arrays.copyOf(b, 384));
            assertThat(padded).isCloseTo(unpadded, within(1e-12));
        }
        if (ModelFiles.present()) {
            Model2VecEmbedder e = ModelFiles.embedder();
            float[] x = e.modelVector("water bill for March");
            float[] y = e.modelVector("utility invoice");
            assertThat(Embedder.cosine(e.embed("water bill for March"), e.embed("utility invoice")))
                    .isCloseTo(Embedder.cosine(x, y), within(1e-6));
        }
    }

    private static double norm(float[] v) {
        double s = 0;
        for (float f : v) {
            s += (double) f * f;
        }
        return Math.sqrt(s);
    }
}
