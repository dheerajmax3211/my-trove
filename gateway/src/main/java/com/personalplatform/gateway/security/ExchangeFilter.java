package com.personalplatform.gateway.security;

import com.personalplatform.gateway.GatewayAttributes;
import com.personalplatform.gateway.Problems;
import com.personalplatform.gateway.config.GatewayProperties;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.cloud.gateway.route.Route;
import org.springframework.cloud.gateway.support.ServerWebExchangeUtils;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.PathContainer;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;
import reactor.core.publisher.Mono;

/**
 * Authenticates the caller before the request is routed: either lets it through untouched (passthrough paths the
 * service authenticates itself) or exchanges its bearer credential for a platform token, enforces the route's
 * required permission, and forwards with {@code Authorization: Bearer <platform token>}. A rejected or unavailable
 * exchange never results in a forwarded request.
 */
@Component
public class ExchangeFilter implements GlobalFilter, Ordered {

    /** Before routing and before the rate limiter. */
    public static final int ORDER = -200;

    static final int MAX_CREDENTIAL_LENGTH = 4096;
    private static final String BEARER = "bearer ";
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Key";

    private static final Logger log = LoggerFactory.getLogger(ExchangeFilter.class);

    private final GatewayProperties props;
    private final ExchangeClient client;
    private final ExchangeCache cache;
    private final PassthroughMatcher passthrough;
    private final List<PathPattern> blocked;

    public ExchangeFilter(GatewayProperties props, ExchangeClient client, ExchangeCache cache,
            PassthroughMatcher passthrough) {
        this.props = props;
        this.client = client;
        this.cache = cache;
        this.passthrough = passthrough;
        this.blocked = props.blocked().stream().map(p -> PathPatternParser.defaultInstance.parse(p)).toList();
    }

    @Override
    public int getOrder() {
        return ORDER;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        Route route = exchange.getAttribute(ServerWebExchangeUtils.GATEWAY_ROUTE_ATTR);
        if (route == null) {
            return chain.filter(exchange);
        }
        String service = route.getId();
        String rawPath = exchange.getRequest().getURI().getRawPath();
        if (RequestPaths.ambiguous(rawPath)) {
            return Problems.write(exchange, HttpStatus.BAD_REQUEST, "bad-path", "Bad request",
                    "The request path is not acceptable.");
        }
        String path = RequestPaths.downstream(rawPath, service);
        PathContainer container = PathContainer.parsePath(path);
        if (blocked.stream().anyMatch(p -> p.matches(container))) {
            return Problems.write(exchange, HttpStatus.NOT_FOUND, "not-found", "Not found", null);
        }

        Optional<PassthroughMatcher.Match> bypass = passthrough.match(service, exchange.getRequest().getMethod().name(), path);
        if (bypass.isPresent()) {
            exchange.getAttributes().put(GatewayAttributes.IDENTITY,
                    CallerIdentity.anonymous(bypass.get().principalType()));
            exchange.getAttributes().put(GatewayAttributes.PASSTHROUGH_PATTERN, bypass.get().pattern());
            return chain.filter(withoutInternalHeaders(exchange, null));
        }

        String credential = bearerCredential(exchange);
        if (credential == null) {
            return reject(exchange, HttpStatus.UNAUTHORIZED, "unauthenticated", "Authentication required",
                    "Send the credential as 'Authorization: Bearer <token>'.");
        }

        Mono<Object> outcome = cache.get(credential, () -> client.exchange(credential))
                .cast(Object.class)
                .onErrorResume(ExchangeFailure.class, Mono::just);
        return outcome.flatMap(o -> {
            if (o instanceof ExchangeFailure failure) {
                return fail(exchange, failure);
            }
            ExchangeResult result = (ExchangeResult) o;
            Optional<String> required = props.requiredPermission(service);
            if (required.isPresent() && !result.identity().permissions().contains(required.get())) {
                return Problems.write(exchange, HttpStatus.FORBIDDEN, "forbidden", "Forbidden",
                        "This route requires the permission '" + required.get() + "'.");
            }
            exchange.getAttributes().put(GatewayAttributes.IDENTITY, result.identity());
            return chain.filter(withoutInternalHeaders(exchange, result.accessToken()));
        });
    }

    private Mono<Void> fail(ServerWebExchange exchange, ExchangeFailure failure) {
        if (failure instanceof ExchangeFailure.Rejected rejected) {
            Map<String, String> headers = rejected.retryAfter() == null ? Map.of()
                    : Map.of(HttpHeaders.RETRY_AFTER, rejected.retryAfter());
            if (rejected.status() == 401) {
                headers = withChallenge(headers);
            }
            if (looksLikeProblem(rejected.body())) {
                return Problems.relay(exchange, rejected.status(), rejected.body(), headers);
            }
            HttpStatus status = HttpStatus.valueOf(rejected.status());
            return Problems.write(exchange, status, status.name().toLowerCase().replace('_', '-'),
                    status.getReasonPhrase(), null, headers);
        }
        ExchangeFailure.Unavailable unavailable = (ExchangeFailure.Unavailable) failure;
        log.warn("token exchange failed: {}", unavailable.getMessage());
        HttpStatus status = unavailable.timeout() ? HttpStatus.GATEWAY_TIMEOUT : HttpStatus.BAD_GATEWAY;
        return Problems.write(exchange, status, "identity-unavailable", "Identity provider unavailable",
                "The request could not be authenticated right now. Nothing was processed; try again shortly.");
    }

    private Mono<Void> reject(ServerWebExchange exchange, HttpStatus status, String slug, String title, String detail) {
        return Problems.write(exchange, status, slug, title, detail, withChallenge(Map.of()));
    }

    private static Map<String, String> withChallenge(Map<String, String> headers) {
        Map<String, String> m = new java.util.LinkedHashMap<>(headers);
        m.put(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
        return m;
    }

    private static boolean looksLikeProblem(byte[] body) {
        return body != null && body.length > 1 && body.length <= 16_384 && body[0] == '{';
    }

    /** The bearer token, or null when absent, malformed or implausibly large. */
    static String bearerCredential(ServerWebExchange exchange) {
        String header = exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        if (header == null || header.length() <= BEARER.length() || !header.regionMatches(true, 0, BEARER, 0, BEARER.length())) {
            return null;
        }
        String token = header.substring(BEARER.length()).strip();
        return token.isEmpty() || token.length() > MAX_CREDENTIAL_LENGTH ? null : token;
    }

    /** Drops headers that only the gateway may send; sets the platform token when there is one. */
    private static ServerWebExchange withoutInternalHeaders(ServerWebExchange exchange, String platformToken) {
        return exchange.mutate().request(r -> r.headers(h -> {
            h.remove(INTERNAL_KEY_HEADER);
            if (platformToken != null) {
                h.set(HttpHeaders.AUTHORIZATION, "Bearer " + platformToken);
            }
        })).build();
    }
}
