package com.personalplatform.consent.consent;

import com.personalplatform.consent.policy.PolicyGrant;
import com.personalplatform.consent.policy.Scope;
import com.personalplatform.consent.policy.Sensitivity;
import com.personalplatform.consent.policy.TimeWindow;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/** A grant joined with its client's public identity. */
public record GrantRow(
        UUID id,
        UUID requestId,
        String ownerUid,
        UUID clientPk,
        String clientId,
        String clientName,
        List<String> scopes,
        String purpose,
        Sensitivity maxSensitivity,
        Instant createdAt,
        Instant expiresAt,
        Integer maxReads,
        int readsUsed,
        TimeWindow window,
        Instant revokedAt,
        Instant lastReadAt) {

    public PolicyGrant toPolicy() {
        return new PolicyGrant(
                id,
                clientId,
                scopes.stream().map(Scope::parse).collect(Collectors.toSet()),
                purpose,
                expiresAt,
                maxReads,
                readsUsed,
                revokedAt,
                maxSensitivity,
                window);
    }

    public String status(Instant now) {
        if (revokedAt != null && !revokedAt.isAfter(now)) {
            return "REVOKED";
        }
        return now.isBefore(expiresAt) ? "ACTIVE" : "EXPIRED";
    }
}
