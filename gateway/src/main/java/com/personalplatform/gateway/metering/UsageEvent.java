package com.personalplatform.gateway.metering;

/**
 * One proxied request, exactly as design 5.4 defines the Kafka value on {@code platform.usage.v1}. No credential, no
 * raw path, no query string and no client address ever goes in here.
 *
 * @param eventId       UUIDv7; platform-service de-duplicates on it
 * @param ts            when the request arrived, ISO-8601 UTC
 * @param principalType USER, API_KEY, CONSENT_CLIENT or ANON
 * @param principalId   user id, {@code app:<id>}, or {@code anon:<hash of the client address>}
 * @param appId         developer app behind an API key, otherwise null
 * @param service       route id, e.g. {@code waiting-on}
 * @param routeTemplate bounded-cardinality route, never a raw path
 * @param rateLimited   the gateway answered 429
 */
public record UsageEvent(
        String eventId,
        String ts,
        String requestId,
        String principalType,
        String principalId,
        String appId,
        String service,
        String method,
        String routeTemplate,
        int status,
        long latencyMs,
        long requestBytes,
        long responseBytes,
        String plan,
        boolean rateLimited) {}
