package com.personalplatform.askyourlife.embedding;

import java.util.ArrayList;
import java.util.List;

/**
 * Turns text into fixed-size, L2-normalised vectors. Implementations must be thread-safe.
 * The database schema is vector(384): the application refuses to start if {@link #dimension()} differs.
 */
public interface Embedder {

    int dimension();

    /**
     * Stable identity of the vector space this embedder produces (kind, model, dimension). It is stored on every
     * indexed document; documents indexed under another id are re-embedded at startup (see {@code ReembedOnStartup}).
     */
    default String id() {
        return getClass().getSimpleName() + ":" + dimension();
    }

    /** Embeds all texts, preserving order. Implementations may split into several backend requests. */
    List<float[]> embedAll(List<String> texts);

    default float[] embed(String text) {
        return embedAll(List.of(text)).get(0);
    }

    /** Cosine similarity of two vectors (not assuming they are normalised). */
    static double cosine(float[] a, float[] b) {
        double dot = 0;
        double na = 0;
        double nb = 0;
        for (int i = 0; i < a.length; i++) {
            dot += (double) a[i] * b[i];
            na += (double) a[i] * a[i];
            nb += (double) b[i] * b[i];
        }
        return na == 0 || nb == 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
    }

    /** Scales to unit length in place; a zero vector is returned unchanged. */
    static float[] normalize(float[] v) {
        double sum = 0;
        for (float f : v) {
            sum += (double) f * f;
        }
        if (sum == 0) {
            return v;
        }
        float inv = (float) (1.0 / Math.sqrt(sum));
        for (int i = 0; i < v.length; i++) {
            v[i] *= inv;
        }
        return v;
    }

    /** Splits a list into consecutive sublists of at most {@code size} elements. */
    static <T> List<List<T>> partition(List<T> items, int size) {
        List<List<T>> out = new ArrayList<>();
        for (int i = 0; i < items.size(); i += size) {
            out.add(items.subList(i, Math.min(items.size(), i + size)));
        }
        return out;
    }
}
