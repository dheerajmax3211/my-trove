package com.personalplatform.gateway;

import java.net.InetSocketAddress;
import org.springframework.web.server.ServerWebExchange;

/**
 * The address of the TCP peer. Deliberately ignores {@code X-Forwarded-For} and {@code Forwarded}: any client can
 * send those, so trusting them would let an anonymous caller dodge the rate limit by rotating a header.
 * (Behind a load balancer this is the balancer's address; a trusted-proxy setting is a deployment concern.)
 */
public final class ClientIp {

    private ClientIp() {}

    public static String of(ServerWebExchange exchange) {
        InetSocketAddress remote = exchange.getRequest().getRemoteAddress();
        if (remote == null || remote.getAddress() == null) {
            return "unknown";
        }
        return remote.getAddress().getHostAddress();
    }
}
