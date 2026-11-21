package com.personalplatform.askyourlife.embedding;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

class HashingEmbedderTest {

    private final HashingEmbedder embedder = new HashingEmbedder(384);

    private double sim(String a, String b) {
        return Embedder.cosine(embedder.embed(a), embedder.embed(b));
    }

    @Test
    void outputsHaveTheConfiguredDimensionAndUnitLength() {
        float[] v = embedder.embed("The quarterly invoice from Acme was paid on 2026-03-04.");
        assertThat(v).hasSize(384);
        double norm = 0;
        for (float f : v) {
            norm += (double) f * f;
        }
        assertThat(norm).isCloseTo(1.0, org.assertj.core.data.Offset.offset(1e-5));
    }

    @Test
    void isDeterministicAcrossInstancesAndCalls() {
        String text = "Lease renewal reminder: sign before the first of the month";
        assertThat(embedder.embed(text)).containsExactly(new HashingEmbedder(384).embed(text));
        assertThat(embedder.embed(text)).containsExactly(embedder.embed(text));
    }

    /** Pins the hash so an accidental change (which would silently invalidate every stored vector) fails loudly. */
    @Test
    void goldenValueIsStable() {
        float[] v = new HashingEmbedder(16).embed("hello world");
        double checksum = 0;
        for (int i = 0; i < v.length; i++) {
            checksum += v[i] * (i + 1);
        }
        assertThat(checksum).isCloseTo(GOLDEN_CHECKSUM, org.assertj.core.data.Offset.offset(1e-5));
    }

    private static final double GOLDEN_CHECKSUM = 7.80738091468811;

    @Test
    void similarTextsScoreFarHigherThanUnrelatedOnes() {
        double near = sim("Electricity bill for March, amount due 84 dollars",
                "March electricity bill amount due: 84 dollars");
        double related = sim("Electricity bill for March, amount due 84 dollars",
                "The electricity bill for April was 91 dollars");
        double unrelated = sim("Electricity bill for March, amount due 84 dollars",
                "Grandma's sourdough recipe needs a long overnight rise");
        assertThat(near).isGreaterThan(0.8);
        assertThat(related).isGreaterThan(unrelated + 0.15);
        assertThat(unrelated).isLessThan(0.15);
        assertThat(sim("same text", "same text")).isCloseTo(1.0, org.assertj.core.data.Offset.offset(1e-6));
    }

    @Test
    void toleratesTyposAndInflection() {
        assertThat(sim("receipt", "recipt")).isGreaterThan(0.25);
        assertThat(sim("invoices", "invoice")).isGreaterThan(0.3);
        assertThat(sim("receipt", "mortgage")).isLessThan(0.15);
    }

    @Test
    void caseAndPunctuationDoNotMatter() {
        assertThat(sim("Hello, World!", "hello world")).isGreaterThan(0.99);
    }

    @Test
    void emptyOrPunctuationOnlyTextStillGivesAUnitVectorNeverZero() {
        for (String s : List.of("", "   ", "!!! ??? ...", "\n")) {
            float[] v = embedder.embed(s);
            assertThat(Embedder.cosine(v, v)).isCloseTo(1.0, org.assertj.core.data.Offset.offset(1e-6));
        }
    }

    @Test
    void handlesUnicode() {
        assertThat(sim("café résumé naïve", "cafe resume naive")).isGreaterThan(0.0);
        assertThat(sim("今日は天気がいいです", "今日は天気がいいですね")).isGreaterThan(0.4);
        assertThat(embedder.embed("😀 emoji 🚀")).hasSize(384);
    }

    @Test
    void embedAllPreservesOrder() {
        List<float[]> all = embedder.embedAll(List.of("alpha beta", "gamma delta"));
        assertThat(all.get(0)).containsExactly(embedder.embed("alpha beta"));
        assertThat(all.get(1)).containsExactly(embedder.embed("gamma delta"));
    }

    @Test
    void rejectsTinyDimensions() {
        assertThatThrownBy(() -> new HashingEmbedder(2)).isInstanceOf(IllegalArgumentException.class);
    }
}
