package com.personalplatform.gateway.support;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.function.Function;
import tools.jackson.databind.json.JsonMapper;

/** A tiny in-process HTTP server used as a downstream service or a contract stub. Records every request it gets. */
public final class StubServer implements AutoCloseable {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    public record Received(String method, String path, Map<String, List<String>> headers, String body) {

        public String header(String name) {
            List<String> v = headers.get(name.toLowerCase(Locale.ROOT));
            return v == null || v.isEmpty() ? null : v.get(0);
        }
    }

    public record Reply(int status, Map<String, String> headers, String body) {

        public static Reply json(int status, String body) {
            return new Reply(status, Map.of("Content-Type", "application/json"), body);
        }

        public static Reply problem(int status, String title) {
            return new Reply(status, Map.of("Content-Type", "application/problem+json"),
                    "{\"type\":\"about:blank\",\"title\":\"" + title + "\",\"status\":" + status + "}");
        }
    }

    private final String name;
    private final HttpServer server;
    private final List<Received> received = new CopyOnWriteArrayList<>();
    private volatile Function<Received, Reply> handler;

    private StubServer(String name) throws IOException {
        this.name = name;
        this.server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        this.handler = this::echo;
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.createContext("/", this::serve);
        server.start();
    }

    public static StubServer start(String name) {
        try {
            return new StubServer(name);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    public int port() {
        return server.getAddress().getPort();
    }

    public String uri() {
        return "http://127.0.0.1:" + port();
    }

    public void handler(Function<Received, Reply> handler) {
        this.handler = handler;
    }

    public void resetHandler() {
        this.handler = this::echo;
    }

    public List<Received> received() {
        return new ArrayList<>(received);
    }

    public Received last() {
        return received.get(received.size() - 1);
    }

    public void clear() {
        received.clear();
    }

    /** Default behaviour: reflect the request back as JSON. */
    public Reply echo(Received r) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("backend", name);
        out.put("method", r.method());
        out.put("path", r.path());
        out.put("body", r.body());
        return Reply.json(200, JSON.writeValueAsString(out));
    }

    private void serve(HttpExchange ex) throws IOException {
        Map<String, List<String>> headers = new LinkedHashMap<>();
        ex.getRequestHeaders().forEach((k, v) -> headers.put(k.toLowerCase(Locale.ROOT), List.copyOf(v)));
        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String path = ex.getRequestURI().getRawPath()
                + (ex.getRequestURI().getRawQuery() == null ? "" : "?" + ex.getRequestURI().getRawQuery());
        Received r = new Received(ex.getRequestMethod(), path, headers, body);
        received.add(r);
        Reply reply;
        try {
            reply = handler.apply(r);
        } catch (RuntimeException e) {
            reply = Reply.json(500, "{\"error\":\"" + e.getMessage() + "\"}");
        }
        byte[] bytes = reply.body() == null ? new byte[0] : reply.body().getBytes(StandardCharsets.UTF_8);
        reply.headers().forEach((k, v) -> ex.getResponseHeaders().add(k, v));
        ex.getResponseHeaders().add("X-Backend", name);
        ex.sendResponseHeaders(reply.status(), bytes.length == 0 ? -1 : bytes.length);
        if (bytes.length > 0) {
            try (OutputStream os = ex.getResponseBody()) {
                os.write(bytes);
            }
        }
        ex.close();
    }

    @Override
    public void close() {
        server.stop(0);
    }
}
