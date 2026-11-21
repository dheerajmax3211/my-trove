package com.personalplatform.askyourlife.embedding;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class HttpEmbedderTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final int DIM = 4;

    private HttpServer server;
    private final List<JsonNode> requests = Collections.synchronizedList(new ArrayList<>());
    private final List<String> authHeaders = Collections.synchronizedList(new ArrayList<>());
    private final AtomicInteger status = new AtomicInteger(200);
    private volatile String forcedBody;
    private volatile boolean reverseOrder;

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/embed", exchange -> {
            JsonNode req = JSON.readTree(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            requests.add(req);
            authHeaders.add(exchange.getRequestHeaders().getFirst("Authorization"));
            String body = forcedBody != null ? forcedBody : fakeResponse(req);
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status.get(), bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    /** Deterministic fake model: vector = [length, 0, 0, 1] (un-normalised on purpose). */
    private String fakeResponse(JsonNode req) {
        List<String> items = new ArrayList<>();
        JsonNode input = req.get("input");
        for (int i = 0; i < input.size(); i++) {
            items.add("{\"index\":" + i + ",\"embedding\":[" + input.get(i).asString().length() + ",0,0,1]}");
        }
        if (reverseOrder) {
            Collections.reverse(items);
        }
        return "{\"data\":[" + String.join(",", items) + "]}";
    }

    private HttpEmbedder embedder(int batchSize, String apiKey) {
        return new HttpEmbedder(URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/embed"),
                "test-model", apiKey, DIM, batchSize, Duration.ofSeconds(5));
    }

    @Test
    void splitsInputsIntoBatchesAndKeepsOrder() {
        List<String> texts = List.of("a", "bb", "ccc", "dddd", "eeeee");
        List<float[]> out = embedder(2, null).embedAll(texts);

        assertThat(requests).hasSize(3);
        assertThat(requests.get(0).get("input")).hasSize(2);
        assertThat(requests.get(1).get("input")).hasSize(2);
        assertThat(requests.get(2).get("input")).hasSize(1);
        assertThat(requests.get(0).get("model").asString()).isEqualTo("test-model");
        assertThat(out).hasSize(5);
        // vectors are normalised: first component ~ len / sqrt(len^2 + 1)
        for (int i = 0; i < texts.size(); i++) {
            double len = texts.get(i).length();
            assertThat((double) out.get(i)[0]).isCloseTo(len / Math.sqrt(len * len + 1), org.assertj.core.data.Offset.offset(1e-5));
            assertThat(Embedder.cosine(out.get(i), out.get(i))).isCloseTo(1.0, org.assertj.core.data.Offset.offset(1e-6));
        }
    }

    @Test
    void honoursTheIndexFieldWhenTheServerReturnsItemsOutOfOrder() {
        reverseOrder = true;
        List<float[]> out = embedder(10, null).embedAll(List.of("a", "bbbb"));
        assertThat(out.get(0)[0]).isLessThan(out.get(1)[0]);
    }

    @Test
    void sendsBearerTokenWhenConfigured() {
        embedder(10, "sekret").embed("x");
        assertThat(authHeaders).containsExactly("Bearer sekret");
    }

    @Test
    void emptyInputMakesNoRequest() {
        assertThat(embedder(2, null).embedAll(List.of())).isEmpty();
        assertThat(requests).isEmpty();
    }

    @Test
    void serverErrorsBecomeEmbeddingExceptions() {
        status.set(503);
        forcedBody = "{}";
        assertThatThrownBy(() -> embedder(2, null).embed("x"))
                .isInstanceOf(HttpEmbedder.EmbeddingException.class)
                .hasMessageContaining("503");
    }

    @Test
    void wrongVectorCountIsRejected() {
        forcedBody = "{\"data\":[{\"index\":0,\"embedding\":[1,0,0,0]}]}";
        assertThatThrownBy(() -> embedder(5, null).embedAll(List.of("a", "b")))
                .isInstanceOf(HttpEmbedder.EmbeddingException.class)
                .hasMessageContaining("1 vectors for 2");
    }

    @Test
    void wrongDimensionIsRejected() {
        forcedBody = "{\"data\":[{\"index\":0,\"embedding\":[1,0,0]}]}";
        assertThatThrownBy(() -> embedder(5, null).embed("a"))
                .isInstanceOf(HttpEmbedder.EmbeddingException.class)
                .hasMessageContaining("dimension 3");
    }

    @Test
    void malformedJsonIsRejected() {
        forcedBody = "<html>nope</html>";
        assertThatThrownBy(() -> embedder(5, null).embed("a")).isInstanceOf(HttpEmbedder.EmbeddingException.class);
    }

    @Test
    void connectionFailureIsWrapped() {
        server.stop(0);
        assertThatThrownBy(() -> embedder(5, null).embed("a")).isInstanceOf(HttpEmbedder.EmbeddingException.class);
    }
}
