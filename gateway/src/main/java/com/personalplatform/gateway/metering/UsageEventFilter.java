package com.personalplatform.gateway.metering;

import com.personalplatform.gateway.ClientIp;
import com.personalplatform.gateway.GatewayAttributes;
import com.personalplatform.gateway.security.CallerIdentity;
import com.personalplatform.gateway.security.PrincipalType;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import org.reactivestreams.Publisher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.route.Route;
import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.http.server.reactive.ServerHttpResponseDecorator;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.publisher.SignalType;

/**
 * Wraps the whole request and, once the response is finished, emits one {@link UsageEvent}: proxied calls and the
 * gateway's own 401, 403 and 429 answers alike. Everything after the response is complete is a constant-time handoff
 * to {@link UsagePublisher}; nothing here can fail or delay the request.
 */
public class UsageEventFilter implements WebFilter, Ordered {

    /** Inside {@link com.personalplatform.gateway.RequestIdFilter}, so the request id is already known. */
    public static final int ORDER = Ordered.HIGHEST_PRECEDENCE + 2;

    private static final Logger log = LoggerFactory.getLogger(UsageEventFilter.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UsagePublisher publisher;

    public UsageEventFilter(UsagePublisher publisher) {
        this.publisher = publisher;
    }

    @Override
    public int getOrder() {
        return ORDER;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        long startNanos = System.nanoTime();
        Instant arrived = Instant.now();
        AtomicLong responseBytes = new AtomicLong();
        AtomicReference<Throwable> error = new AtomicReference<>();
        ServerWebExchange counted = exchange.mutate().response(new CountingResponse(exchange.getResponse(), responseBytes)).build();
        return chain.filter(counted)
                .doOnError(error::set)
                .doFinally(signal -> record(exchange, signal, error.get(), arrived, startNanos, responseBytes.get()));
    }

    private void record(ServerWebExchange exchange, SignalType signal, Throwable error, Instant arrived, long startNanos,
            long responseBytes) {
        try {
            Route route = exchange.getAttribute(ServerWebExchangeUtils.GATEWAY_ROUTE_ATTR);
            if (route == null) {
                return; // not a gateway route (no such service): nothing to meter
            }
            int status = statusOf(exchange.getResponse().getStatusCode(), signal, error);
            CallerIdentity identity = exchange.getAttribute(GatewayAttributes.IDENTITY);
            if (identity == null) {
                identity = CallerIdentity.anonymous(PrincipalType.ANON);
            }
            String principalId = identity.principalId() != null ? identity.principalId() : anonKey(exchange);
            String pattern = exchange.getAttribute(GatewayAttributes.PASSTHROUGH_PATTERN);
            String template = pattern != null ? pattern
                    : RouteTemplate.of(exchange.getRequest().getURI().getRawPath(), route.getId());
            long requestBytes = Math.max(0, exchange.getRequest().getHeaders().getContentLength());
            long bytesOut = responseBytes > 0 ? responseBytes : Math.max(0, exchange.getResponse().getHeaders().getContentLength());
            boolean limited = Boolean.TRUE.equals(exchange.getAttribute(GatewayAttributes.RATE_LIMITED)) || status == 429;
            Object requestId = exchange.getAttribute(GatewayAttributes.REQUEST_ID);

            publisher.publish(new UsageEvent(
                    uuidV7().toString(),
                    arrived.toString(),
                    requestId == null ? null : requestId.toString(),
                    identity.type().name(),
                    principalId,
                    identity.appId(),
                    route.getId(),
                    exchange.getRequest().getMethod().name(),
                    template,
                    status,
                    Math.max(0, (System.nanoTime() - startNanos) / 1_000_000),
                    requestBytes,
                    bytesOut,
                    identity.plan(),
                    limited));
        } catch (RuntimeException e) {
            log.debug("usage event not recorded: {}", e.toString());
        }
    }

    private static int statusOf(HttpStatusCode status, SignalType signal, Throwable error) {
        if (error instanceof ResponseStatusException rse) {
            return rse.getStatusCode().value();
        }
        if (error != null && status == null) {
            return 500;
        }
        if (status != null) {
            return status.value();
        }
        return signal == SignalType.CANCEL ? 499 : 200;
    }

    /** {@code anon:<16 hex chars of SHA-256(client address)>}: stable per address, not reversible to it by reading the topic. */
    private static String anonKey(ServerWebExchange exchange) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(ClientIp.of(exchange).getBytes(StandardCharsets.UTF_8));
            return "anon:" + HexFormat.of().formatHex(digest, 0, 8);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** RFC 9562 version 7: 48-bit millisecond timestamp, then random bits. */
    static UUID uuidV7() {
        long msb = (System.currentTimeMillis() << 16) | (0x7L << 12) | (RANDOM.nextLong() & 0x0FFFL);
        long lsb = (RANDOM.nextLong() & 0x3FFF_FFFF_FFFF_FFFFL) | 0x8000_0000_0000_0000L;
        return new UUID(msb, lsb);
    }

    /** Counts the bytes of the body as it is written to the client. */
    private static final class CountingResponse extends ServerHttpResponseDecorator {

        private final AtomicLong bytes;

        CountingResponse(ServerHttpResponse delegate, AtomicLong bytes) {
            super(delegate);
            this.bytes = bytes;
        }

        @Override
        public Mono<Void> writeWith(Publisher<? extends DataBuffer> body) {
            return super.writeWith(Flux.from(body).doOnNext(b -> bytes.addAndGet(b.readableByteCount())));
        }

        @Override
        public Mono<Void> writeAndFlushWith(Publisher<? extends Publisher<? extends DataBuffer>> body) {
            return super.writeAndFlushWith(Flux.from(body).map(
                    inner -> Flux.from(inner).doOnNext(b -> bytes.addAndGet(b.readableByteCount()))));
        }
    }
}
