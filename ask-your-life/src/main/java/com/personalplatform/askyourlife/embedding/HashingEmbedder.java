package com.personalplatform.askyourlife.embedding;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Deterministic "hashing trick" embedder: no model, no network, stable across JVMs and releases.
 *
 * <p>Features per text: lower-cased word unigrams (weight 1), word bigrams (0.5) and character trigrams of each
 * word with boundary markers (0.35, which gives some tolerance to typos and inflection: "receipt" vs "recipt").
 * Term counts are sub-linearly scaled (1 + ln tf). Each feature is hashed (FNV-1a, 64 bit, over UTF-8) to a
 * bucket and a sign, accumulated, and the result is L2-normalised, so cosine similarity is a dot product.
 *
 * <p>It is lexical, not semantic: it is the default for development and tests, and a stand-in with the same
 * interface as a real model. A text with no features (empty / punctuation only) maps to the first basis vector so
 * the output is never the zero vector (pgvector's cosine distance is undefined for it).
 */
public final class HashingEmbedder implements Embedder {

    private static final Set<String> STOPWORDS = Set.of(
            "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of", "on", "or",
            "that", "the", "to", "was", "were", "with", "i", "my", "me", "we", "our", "you", "your", "this", "has", "have");

    private static final double UNIGRAM_WEIGHT = 1.0;
    private static final double BIGRAM_WEIGHT = 0.5;
    private static final double TRIGRAM_WEIGHT = 0.35;

    private final int dimension;

    public HashingEmbedder(int dimension) {
        if (dimension < 8) {
            throw new IllegalArgumentException("dimension must be >= 8");
        }
        this.dimension = dimension;
    }

    @Override
    public int dimension() {
        return dimension;
    }

    @Override
    public String id() {
        return "hashing-v1:" + dimension;
    }

    @Override
    public List<float[]> embedAll(List<String> texts) {
        return texts.stream().map(this::embedOne).toList();
    }

    private float[] embedOne(String text) {
        Map<String, Integer> counts = new HashMap<>();
        Map<String, Double> weights = new HashMap<>();
        String normalised = Normalizer.normalize(text == null ? "" : text, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        List<String> words = words(normalised);
        String previous = null;
        for (String w : words) {
            if (STOPWORDS.contains(w)) {
                previous = null;
                continue;
            }
            add(counts, weights, "u:" + w, UNIGRAM_WEIGHT);
            if (previous != null) {
                add(counts, weights, "b:" + previous + " " + w, BIGRAM_WEIGHT);
            }
            previous = w;
            if (w.codePointCount(0, w.length()) >= 3) {
                String padded = "^" + w + "$";
                int[] cps = padded.codePoints().toArray();
                for (int i = 0; i + 3 <= cps.length; i++) {
                    add(counts, weights, "t:" + new String(cps, i, 3), TRIGRAM_WEIGHT);
                }
            }
        }
        float[] v = new float[dimension];
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            long h = fnv1a64(e.getKey());
            int bucket = (int) Long.remainderUnsigned(h >>> 1, dimension);
            double sign = (h & 1L) == 0 ? 1.0 : -1.0;
            v[bucket] += (float) (sign * weights.get(e.getKey()) * (1.0 + Math.log(e.getValue())));
        }
        double norm = 0;
        for (float f : v) {
            norm += (double) f * f;
        }
        if (norm == 0) {
            v[0] = 1f;
            return v;
        }
        return Embedder.normalize(v);
    }

    private static void add(Map<String, Integer> counts, Map<String, Double> weights, String feature, double weight) {
        counts.merge(feature, 1, Integer::sum);
        weights.putIfAbsent(feature, weight);
    }

    private static List<String> words(String text) {
        List<String> out = new java.util.ArrayList<>();
        StringBuilder sb = new StringBuilder();
        text.codePoints().forEach(cp -> {
            if (Character.isLetterOrDigit(cp)) {
                sb.appendCodePoint(cp);
            } else if (sb.length() > 0) {
                out.add(sb.toString());
                sb.setLength(0);
            }
        });
        if (sb.length() > 0) {
            out.add(sb.toString());
        }
        return out;
    }

    private static long fnv1a64(String s) {
        long h = 0xcbf29ce484222325L;
        for (byte b : s.getBytes(StandardCharsets.UTF_8)) {
            h ^= (b & 0xffL);
            h *= 0x100000001b3L;
        }
        // final avalanche so that low bits (used for the sign / bucket) are well mixed
        h ^= h >>> 33;
        h *= 0xff51afd7ed558ccdL;
        h ^= h >>> 33;
        return h;
    }
}
