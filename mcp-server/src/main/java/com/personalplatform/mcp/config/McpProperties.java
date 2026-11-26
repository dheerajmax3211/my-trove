package com.personalplatform.mcp.config;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Where the product services live and how long a tool may wait for one. Tools call each service directly with the
 * caller's own platform token (the gateway cannot re-exchange a platform token), never with a credential of their own.
 *
 * @param services base URI per product service; defaults are the local ports {@code dev/up.sh} uses
 * @param timeout  budget for one downstream call (connect and read)
 */
@ConfigurationProperties("app.mcp")
public record McpProperties(Map<String, String> services, Duration timeout) {

    public static final String WAITING_ON = "waiting-on";
    public static final String ASK_YOUR_LIFE = "ask-your-life";
    public static final String HOME_PULSE = "home-pulse";
    public static final String FAMILY_TREASURY = "family-treasury";

    public McpProperties {
        Map<String, String> merged = new LinkedHashMap<>();
        merged.put(WAITING_ON, "http://localhost:8083");
        merged.put(ASK_YOUR_LIFE, "http://localhost:8086");
        merged.put(HOME_PULSE, "http://localhost:8085");
        merged.put(FAMILY_TREASURY, "http://localhost:8088");
        if (services != null) {
            services.forEach((name, uri) -> {
                if (uri != null && !uri.isBlank()) {
                    merged.put(name, uri.endsWith("/") ? uri.substring(0, uri.length() - 1) : uri);
                }
            });
        }
        services = Map.copyOf(merged);
        timeout = timeout == null ? Duration.ofSeconds(5) : timeout;
    }

    public String uri(String service) {
        String uri = services.get(service);
        if (uri == null) {
            throw new IllegalArgumentException("no URI configured for service " + service);
        }
        return uri;
    }
}
