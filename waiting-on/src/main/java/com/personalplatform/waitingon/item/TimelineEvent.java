package com.personalplatform.waitingon.item;

import java.time.OffsetDateTime;
import java.util.UUID;

public record TimelineEvent(UUID id, UUID itemId, EventType type, String summary, String detail,
        OffsetDateTime occurredAt) {
}
