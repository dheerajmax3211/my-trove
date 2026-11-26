package com.personalplatform.mcp;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/** A tiny HTTP stub for one product service: canned answers by path, and a record of what it received. */
final class StubService {

    record Received(String method, String path, String rawQuery, String authorization, String internalKey, String body) {}

    record Reply(int status, String body) {}

    private final HttpServer server;
    private final Map<String, Reply> replies = new ConcurrentHashMap<>();
    private final List<Received> received = new CopyOnWriteArrayList<>();

    private StubService() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            received.add(new Received(exchange.getRequestMethod(), path, exchange.getRequestURI().getRawQuery(),
                    exchange.getRequestHeaders().getFirst("Authorization"),
                    exchange.getRequestHeaders().getFirst("X-Internal-Key"),
                    new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
            Reply reply = replies.getOrDefault(path, new Reply(404, "{\"title\":\"Not Found\"}"));
            byte[] body = reply.body().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(reply.status(), body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        });
        server.start();
    }

    static StubService start() {
        try {
            return new StubService();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    String uri() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    StubService reply(String path, int status, String body) {
        replies.put(path, new Reply(status, body));
        return this;
    }

    List<Received> received() {
        return List.copyOf(received);
    }

    void reset() {
        replies.clear();
        received.clear();
    }
}
