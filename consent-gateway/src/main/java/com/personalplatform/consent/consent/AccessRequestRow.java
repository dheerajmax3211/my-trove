package com.personalplatform.consent.consent;

import com.personalplatform.consent.policy.TimeWindow;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record AccessRequestRow(
        UUID id,
        String ownerUid,
        UUID clientPk,
        String clientId,
        String clientName,
        List<String> scopes,
        String purpose,
        int durationSeconds,
        Integer maxReads,
        TimeWindow window,
        String status,
        Instant createdAt,
        Instant decidedAt,
        String decisionNote) {}
