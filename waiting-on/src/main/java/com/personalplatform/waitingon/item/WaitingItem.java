package com.personalplatform.waitingon.item;

import com.personalplatform.waitingon.escalation.EscalationPlan;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

public record WaitingItem(
        UUID id,
        String ownerUid,
        String title,
        String counterparty,
        String counterpartyEmail,
        ItemCategory category,
        BigDecimal amount,
        String currency,
        LocalDate expectedBy,
        ItemStatus status,
        String outcome,
        String replyToken,
        String workflowId,
        EscalationPlan plan,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        OffsetDateTime closedAt) {
}
