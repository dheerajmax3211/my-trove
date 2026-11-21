package com.personalplatform.consent.policy;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

/**
 * The facts the policy engine decides on. {@code maxReads == null} means unlimited; {@code window == null} means
 * any time; {@code revokedAt == null} means not revoked.
 */
public record PolicyGrant(
        UUID id,
        String clientId,
        Set<Scope> scopes,
        String purpose,
        Instant expiresAt,
        Integer maxReads,
        int readsUsed,
        Instant revokedAt,
        Sensitivity maxSensitivity,
        TimeWindow window) {

    public PolicyGrant {
        scopes = scopes == null ? Set.of() : Set.copyOf(scopes);
    }
}
