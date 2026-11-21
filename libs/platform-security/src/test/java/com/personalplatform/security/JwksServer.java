package com.personalplatform.security;

import com.personalplatform.security.testing.PlatformTestTokens;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

/** Tiny in-process JWKS endpoint so the decoder is exercised exactly as it runs in a service (remote JWK set). */
final class JwksServer implements AutoCloseable {

    private final HttpServer server;

    JwksServer(PlatformTestTokens tokens) {
        try {
            server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        byte[] body = tokens.jwkSetJson().getBytes(StandardCharsets.UTF_8);
        server.createContext("/.well-known/jwks.json", exchange -> {
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (var out = exchange.getResponseBody()) {
                out.write(body);
            }
        });
        server.start();
    }

    String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/.well-known/jwks.json";
    }

    @Override
    public void close() {
        server.stop(0);
    }
}
