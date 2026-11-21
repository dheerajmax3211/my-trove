package com.personalplatform.gateway;

import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

/**
 * Gives every request a correlation id: the caller's {@code X-Request-Id} when it is a plain token, otherwise a new
 * one. The id goes downstream, back to the caller, into problem bodies and into the usage event.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class RequestIdFilter implements WebFilter {

    public static final String HEADER = "X-Request-Id";

    private static final Pattern ACCEPTABLE = Pattern.compile("[A-Za-z0-9._-]{8,64}");

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String supplied = exchange.getRequest().getHeaders().getFirst(HEADER);
        String id = supplied != null && ACCEPTABLE.matcher(supplied).matches() ? supplied : UUID.randomUUID().toString();
        exchange.getAttributes().put(GatewayAttributes.REQUEST_ID, id);
        exchange.getResponse().getHeaders().set(HEADER, id);
        ServerWebExchange forwarded = exchange.mutate().request(r -> r.headers(h -> h.set(HEADER, id))).build();
        return chain.filter(forwarded);
    }
}
