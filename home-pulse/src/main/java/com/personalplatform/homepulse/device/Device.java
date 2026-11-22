package com.personalplatform.homepulse.device;

import java.time.Instant;
import java.util.UUID;

public record Device(
        UUID id,
        String ownerUid,
        UUID applianceId,
        String label,
        String tokenPrefix,
        Instant createdAt,
        Instant lastSeenAt,
        Instant revokedAt,
        boolean simulated) {

    public boolean active() {
        return revokedAt == null;
    }
}
