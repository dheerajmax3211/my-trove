package com.personalplatform.gateway.config;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Everything configurable about the gateway. Missing values fall back to the local-development defaults, so a bare
 * {@code java -jar gateway.jar} works next to the services started by {@code dev/up.sh}.
 *
 * @param services    base URI per service name ({@code gateway.services.<name>.uri})
 * @param routes      per route policy ({@code gateway.routes.<name>.required-permission}); an empty value means none
 * @param passthrough requests the downstream service authenticates itself; forwarded without an exchange
 * @param blocked     downstream path patterns that are never reachable through the gateway
 */
@ConfigurationProperties("gateway")
public record GatewayProperties(
        Map<String, Service> services,
        Map<String, Route> routes,
        List<Passthrough> passthrough,
        List<String> blocked,
        Cors cors,
        Exchange exchange,
        Internal internal,
        RateLimit rateLimit) {

    public static final String PRODUCTS_USE = "products:use";

    /** Service name to local port, in route order. */
    public static final Map<String, Integer> DEFAULT_PORTS = defaultPorts();

    private static final Set<String> PRODUCT_ROUTES = Set.of("waiting-on", "consent", "home-pulse", "ask-your-life",
            "digital-legacy", "family-treasury");

    private static final List<String> DEFAULT_ORIGINS = List.of("http://localhost:5173", "http://localhost:5181",
            "http://localhost:5182", "http://localhost:5183", "http://localhost:5184", "http://localhost:5185",
            "http://localhost:5186", "http://localhost:5187", "http://localhost:5188", "http://localhost:5189",
            "http://localhost:5190");

    public record Service(String uri) {}

    public record Route(String requiredPermission) {}

    /**
     * @param service       route id the rule applies to
     * @param methods       HTTP methods; empty means any
     * @param path          pattern matched against the downstream path (after {@code /api/<service>})
     * @param principalType what the metering event calls the caller; {@code ANON} unless the caller is a consent client
     * @param description   which credential the service checks itself (documentation only)
     */
    public record Passthrough(String service, List<String> methods, String path, String principalType,
            String description) {

        public Passthrough {
            methods = methods == null ? List.of() : List.copyOf(methods);
            principalType = principalType == null || principalType.isBlank() ? "ANON" : principalType;
        }
    }

    public record Cors(List<String> allowedOrigins) {

        public Cors {
            allowedOrigins = allowedOrigins == null || allowedOrigins.isEmpty() ? DEFAULT_ORIGINS : List.copyOf(allowedOrigins);
        }
    }

    /**
     * @param cacheTtl        how long an exchanged platform token is reused for the same credential
     * @param cacheMaxEntries upper bound on cached exchanges
     * @param timeout         budget for one call to {@code auth}
     */
    public record Exchange(Duration cacheTtl, Integer cacheMaxEntries, Duration timeout) {

        public Exchange {
            cacheTtl = cacheTtl == null ? Duration.ofSeconds(60) : cacheTtl;
            cacheMaxEntries = cacheMaxEntries == null ? 10_000 : cacheMaxEntries;
            timeout = timeout == null ? Duration.ofSeconds(3) : timeout;
        }
    }

    /** Shared secret for {@code platform-service /internal/**}; never logged, never forwarded to clients. */
    public record Internal(String apiKey) {}

    /**
     * Limits and the platform-service calls behind them.
     *
     * @param planRefresh     how often plan limits are re-read from platform-service
     * @param quotaCacheTtl   how long a principal's monthly usage figure is reused
     * @param platformTimeout budget for one platform-service call (made in the background, never on a request)
     * @param failureBackoff  wait before retrying a failed platform-service call
     * @param maxStale        a usage figure older than this is ignored (fail open)
     * @param maxBuckets      bound on live per-principal rate-limit buckets and cached quota entries
     */
    public record RateLimit(Duration planRefresh, Duration quotaCacheTtl, Duration platformTimeout,
            Duration failureBackoff, Duration maxStale, Integer maxBuckets) {

        public RateLimit {
            planRefresh = planRefresh == null ? Duration.ofMinutes(5) : planRefresh;
            quotaCacheTtl = quotaCacheTtl == null ? Duration.ofSeconds(30) : quotaCacheTtl;
            platformTimeout = platformTimeout == null ? Duration.ofSeconds(1) : platformTimeout;
            failureBackoff = failureBackoff == null ? Duration.ofSeconds(15) : failureBackoff;
            maxStale = maxStale == null ? Duration.ofMinutes(10) : maxStale;
            maxBuckets = maxBuckets == null ? 100_000 : maxBuckets;
        }
    }

    public GatewayProperties {
        Map<String, Service> merged = new LinkedHashMap<>();
        DEFAULT_PORTS.forEach((name, port) -> merged.put(name, new Service("http://localhost:" + port)));
        if (services != null) {
            services.forEach((name, s) -> {
                if (s != null && s.uri() != null && !s.uri().isBlank()) {
                    merged.put(name, s);
                }
            });
        }
        services = Map.copyOf(merged);
        routes = routes == null ? Map.of() : Map.copyOf(routes);
        passthrough = passthrough == null ? List.of() : List.copyOf(passthrough);
        blocked = blocked == null || blocked.isEmpty() ? List.of("/internal/**", "/actuator/**") : List.copyOf(blocked);
        cors = cors == null ? new Cors(null) : cors;
        exchange = exchange == null ? new Exchange(null, null, null) : exchange;
        internal = internal == null ? new Internal(null) : internal;
        rateLimit = rateLimit == null ? new RateLimit(null, null, null, null, null, null) : rateLimit;
    }

    public static GatewayProperties defaults() {
        return new GatewayProperties(null, null, null, null, null, null, null, null);
    }

    /** Permission a caller must hold to use this route, from configuration or the built-in default. */
    public Optional<String> requiredPermission(String service) {
        Route configured = routes.get(service);
        if (configured != null && configured.requiredPermission() != null) {
            String p = configured.requiredPermission().strip();
            return p.isEmpty() ? Optional.empty() : Optional.of(p);
        }
        return PRODUCT_ROUTES.contains(service) ? Optional.of(PRODUCTS_USE) : Optional.empty();
    }

    private static Map<String, Integer> defaultPorts() {
        Map<String, Integer> m = new LinkedHashMap<>();
        m.put("auth", 8081);
        m.put("shared", 8082);
        m.put("waiting-on", 8083);
        m.put("consent", 8084);
        m.put("home-pulse", 8085);
        m.put("ask-your-life", 8086);
        m.put("digital-legacy", 8087);
        m.put("family-treasury", 8088);
        m.put("platform", 8089);
        return Map.copyOf(m);
    }
}
