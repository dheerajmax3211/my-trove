package com.personalplatform.askyourlife.embedding;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Embedder backed by an HTTP service speaking an OpenAI-style embeddings protocol:
 *
 * <pre>
 * POST {url}   {"model": "...", "input": ["text", ...]}
 * 200          {"data": [{"index": 0, "embedding": [..]}, ...]}
 * </pre>
 *
 * Inputs are sent in batches of at most {@code batchSize}; each response is validated (count, dimension) and the
 * vectors are L2-normalised. Any failure raises {@link EmbeddingException}: the ingestion worker owns retrying.
 */
public final class HttpEmbedder implements Embedder {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final URI url;
    private final String model;
    private final String apiKey;
    private final int dimension;
    private final int batchSize;
    private final Duration timeout;
    private final HttpClient client;

    public HttpEmbedder(URI url, String model, String apiKey, int dimension, int batchSize, Duration timeout) {
        if (batchSize < 1) {
            throw new IllegalArgumentException("batchSize must be >= 1");
        }
        this.url = url;
        this.model = model;
        this.apiKey = apiKey;
        this.dimension = dimension;
        this.batchSize = batchSize;
        this.timeout = timeout;
        this.client = HttpClient.newBuilder().connectTimeout(timeout).build();
    }

    @Override
    public int dimension() {
        return dimension;
    }

    @Override
    public String id() {
        return "http:" + (model == null || model.isBlank() ? url.getHost() : model) + ":" + dimension;
    }

    @Override
    public List<float[]> embedAll(List<String> texts) {
        List<float[]> out = new ArrayList<>(texts.size());
        for (List<String> batch : Embedder.partition(texts, batchSize)) {
            out.addAll(embedBatch(batch));
        }
        return out;
    }

    private List<float[]> embedBatch(List<String> batch) {
        Map<String, Object> body = new LinkedHashMap<>();
        if (model != null && !model.isBlank()) {
            body.put("model", model);
        }
        body.put("input", batch);
        HttpRequest.Builder request = HttpRequest.newBuilder(url)
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)));
        if (apiKey != null && !apiKey.isBlank()) {
            request.header("Authorization", "Bearer " + apiKey);
        }
        HttpResponse<String> response;
        try {
            response = client.send(request.build(), HttpResponse.BodyHandlers.ofString());
        } catch (IOException e) {
            throw new EmbeddingException("embedding request failed: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new EmbeddingException("embedding request interrupted", e);
        }
        if (response.statusCode() / 100 != 2) {
            throw new EmbeddingException("embedding service returned HTTP " + response.statusCode());
        }
        return parse(response.body(), batch.size());
    }

    private List<float[]> parse(String json, int expected) {
        JsonNode data;
        try {
            data = JSON.readTree(json).path("data");
        } catch (RuntimeException e) {
            throw new EmbeddingException("embedding service returned malformed JSON", e);
        }
        if (!data.isArray() || data.size() != expected) {
            throw new EmbeddingException("embedding service returned " + (data.isArray() ? data.size() : 0)
                    + " vectors for " + expected + " inputs");
        }
        float[][] ordered = new float[expected][];
        for (int pos = 0; pos < data.size(); pos++) {
            JsonNode item = data.get(pos);
            int index = item.has("index") ? item.get("index").asInt(-1) : pos;
            JsonNode emb = item.path("embedding");
            if (index < 0 || index >= expected || ordered[index] != null || !emb.isArray()) {
                throw new EmbeddingException("embedding service returned an invalid item at position " + pos);
            }
            if (emb.size() != dimension) {
                throw new EmbeddingException("embedding has dimension " + emb.size() + ", expected " + dimension);
            }
            float[] v = new float[dimension];
            for (int i = 0; i < dimension; i++) {
                v[i] = (float) emb.get(i).asDouble();
            }
            ordered[index] = Embedder.normalize(v);
        }
        return List.of(ordered);
    }

    public static class EmbeddingException extends RuntimeException {
        public EmbeddingException(String message) {
            super(message);
        }

        public EmbeddingException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
