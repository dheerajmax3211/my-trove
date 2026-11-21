package com.personalplatform.consent.audit;

import java.time.Instant;
import java.util.UUID;

public record AuditEntry(
        long seq,
        String eventType,
        String actorType,
        String actorId,
        String clientId,
        UUID grantId,
        String detail,
        Instant occurredAt,
        String prevHash,
        String entryHash) {}
