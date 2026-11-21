package com.personalplatform.gateway;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import tools.jackson.databind.json.JsonMapper;

/** Writes RFC 9457 problem responses straight from a filter. */
public final class Problems {

    public static final String TYPE_PREFIX = "https://my-trove.dev/problems/";

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private Problems() {}

    public static Mono<Void> write(ServerWebExchange exchange, HttpStatusCode status, String slug, String title,
            String detail) {
        return write(exchange, status, slug, title, detail, Map.of());
    }

    public static Mono<Void> write(ServerWebExchange exchange, HttpStatusCode status, String slug, String title,
            String detail, Map<String, String> headers) {
        ServerHttpResponse response = exchange.getResponse();
        if (response.isCommitted()) {
            return Mono.empty();
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", TYPE_PREFIX + slug);
        body.put("title", title);
        body.put("status", status.value());
        if (detail != null) {
            body.put("detail", detail);
        }
        Object requestId = exchange.getAttribute(GatewayAttributes.REQUEST_ID);
        if (requestId != null) {
            body.put("requestId", requestId);
        }
        byte[] bytes = JSON.writeValueAsString(body).getBytes(StandardCharsets.UTF_8);
        response.setStatusCode(status);
        headers.forEach((k, v) -> response.getHeaders().set(k, v));
        response.getHeaders().setContentType(MediaType.APPLICATION_PROBLEM_JSON);
        response.getHeaders().setContentLength(bytes.length);
        DataBuffer buffer = response.bufferFactory().wrap(bytes);
        return response.writeWith(Mono.just(buffer));
    }

    /** Relay a problem body produced by another service (the exchange), keeping its status. */
    public static Mono<Void> relay(ServerWebExchange exchange, int status, byte[] body, Map<String, String> headers) {
        ServerHttpResponse response = exchange.getResponse();
        if (response.isCommitted()) {
            return Mono.empty();
        }
        response.setStatusCode(HttpStatus.valueOf(status));
        headers.forEach((k, v) -> response.getHeaders().set(k, v));
        response.getHeaders().setContentType(MediaType.APPLICATION_PROBLEM_JSON);
        response.getHeaders().setContentLength(body.length);
        return response.writeWith(Mono.just(response.bufferFactory().wrap(body)));
    }
}
