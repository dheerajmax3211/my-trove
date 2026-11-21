package com.personalplatform.treasury.approval;

import java.time.Instant;
import java.util.UUID;

public record ApprovalView(
        UUID id, UUID householdId, String requestedByUid, UUID fromAccountId, UUID toAccountId, long amountMinor,
        String currency, String description, String status, Instant expiresAt, String decidedByUid, Instant decidedAt,
        String decisionNote, UUID entryId, Instant createdAt) {}
