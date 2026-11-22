package com.personalplatform.homepulse.device;

import java.time.Instant;
import java.util.UUID;

/**
 * @param simulated the built-in simulator's device
 * @param manual    readings the owner enters by hand (meter totals or CSV). It never reports by itself.
 */
public record Device(
        UUID id,
        String ownerUid,
        UUID applianceId,
        String label,
        String tokenPrefix,
        Instant createdAt,
        Instant lastSeenAt,
        Instant revokedAt,
        boolean simulated,
        boolean manual) {

    public boolean active() {
        return revokedAt == null;
    }

    public ReadingSource source() {
        if (simulated) {
            return ReadingSource.SIMULATED;
        }
        return manual ? ReadingSource.MANUAL : ReadingSource.DEVICE;
    }
}
