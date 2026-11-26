package com.personalplatform.askyourlife.support;

import com.personalplatform.askyourlife.embedding.Embedder;
import com.personalplatform.askyourlife.embedding.HashingEmbedder;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Test embedder: delegates to the hashing embedder, except for texts with a registered fixed vector (used to build
 * exact rankings), counts calls per text, and can be told to fail.
 */
public class ScriptedEmbedder implements Embedder {

    private static final Embedder HASHING = new HashingEmbedder(384);
    private volatile Embedder delegate = HASHING;
    /** What {@link #id()} reports; tests change it to simulate switching models. */
    public volatile String id = "scripted:384";
    private final Map<String, float[]> fixed = new ConcurrentHashMap<>();
    public final Map<String, AtomicInteger> calls = new ConcurrentHashMap<>();
    public final AtomicInteger totalCalls = new AtomicInteger();
    public final AtomicReference<RuntimeException> failure = new AtomicReference<>();
    public volatile int failuresLeft = 0;

    public void fix(String text, float[] vector) {
        fixed.put(text, vector);
    }

    public void reset() {
        fixed.clear();
        calls.clear();
        totalCalls.set(0);
        failure.set(null);
        failuresLeft = 0;
        delegate = HASHING;
        id = "scripted:384";
    }

    /** Embed unregistered texts with {@code e} instead of the hashing embedder (e.g. the real Model2Vec model). */
    public void delegateTo(Embedder e) {
        delegate = e;
    }

    @Override
    public String id() {
        return id;
    }

    @Override
    public int dimension() {
        return 384;
    }

    @Override
    public List<float[]> embedAll(List<String> texts) {
        totalCalls.incrementAndGet();
        if (failuresLeft > 0) {
            failuresLeft--;
            throw new IllegalStateException("embedder unavailable (scripted)");
        }
        RuntimeException f = failure.get();
        if (f != null) {
            throw f;
        }
        texts.forEach(t -> calls.computeIfAbsent(t, k -> new AtomicInteger()).incrementAndGet());
        return texts.stream().map(t -> fixed.containsKey(t) ? fixed.get(t) : delegate.embed(t)).toList();
    }

    /** Unit vector with weight on axis a (and optionally b): cosine to axis-a vector = cos(angle). */
    public static float[] axis(int a, int b, double mixB) {
        float[] v = new float[384];
        v[a] = (float) Math.sqrt(1 - mixB * mixB);
        if (b >= 0) {
            v[b] = (float) mixB;
        }
        return v;
    }
}
