package com.personalplatform.platform.usage;

import java.time.Instant;
import java.util.UUID;

/**
 * One proxied request as published by the gateway on {@code platform.usage.v1} (design 5.4). Always built by
 * {@link UsageEventParser}, which has already validated every field against the column limits.
 *
 * @param principalId the platform token's {@code uid} for a USER, the key / client id otherwise, {@code anon:<hash>} for ANON
 * @param routeTemplate the matched route pattern ({@code /v1/items/{id}}), never the raw path
 */
public record UsageEvent(
        UUID eventId,
        Instant ts,
        String requestId,
        PrincipalType principalType,
        String principalId,
        String appId,
        String service,
        String method,
        String routeTemplate,
        int status,
        int latencyMs,
        long requestBytes,
        long responseBytes,
        String plan,
        boolean rateLimited) {
}
