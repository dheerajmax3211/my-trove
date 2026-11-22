package com.personalplatform.platform;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

/** A developer's receiver for tests: records every delivery it gets and answers with a status it is told to. */
final class WebhookReceiverStub {

    record Hit(String body, Map<String, String> headers) {
        String header(String name) {
            return headers.get(name.toLowerCase(java.util.Locale.ROOT));
        }
    }

    private final HttpServer server;
    private final List<Hit> hits = new CopyOnWriteArrayList<>();
    private final AtomicInteger status = new AtomicInteger(200);

    private WebhookReceiverStub(HttpServer server) {
        this.server = server;
    }

    static WebhookReceiverStub start() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        WebhookReceiverStub stub = new WebhookReceiverStub(server);
        server.createContext("/hook", exchange -> {
            Map<String, String> headers = new java.util.HashMap<>();
            exchange.getRequestHeaders().forEach((k, v) -> headers.put(k.toLowerCase(java.util.Locale.ROOT), v.get(0)));
            byte[] body = exchange.getRequestBody().readAllBytes();
            stub.hits.add(new Hit(new String(body, StandardCharsets.UTF_8), headers));
            exchange.sendResponseHeaders(stub.status.get(), -1);
            exchange.close();
        });
        server.start();
        return stub;
    }

    String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/hook";
    }

    void respondWith(int code) {
        status.set(code);
    }

    /** Forgets earlier deliveries and answers 200 again. */
    void reset() {
        hits.clear();
        status.set(200);
    }

    List<Hit> hits() {
        return new ArrayList<>(hits);
    }

    void stop() {
        server.stop(0);
    }
}
