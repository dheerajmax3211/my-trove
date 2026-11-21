package com.personalplatform.waitingon.escalation;

import com.personalplatform.waitingon.item.ItemCategory;
import java.math.BigDecimal;
import java.time.LocalDate;

/** Everything the template engine needs; no clock or database access inside the engine. */
public record LetterContext(
        String title,
        String counterparty,
        ItemCategory category,
        BigDecimal amount,
        String currency,
        LocalDate expectedBy,
        LocalDate createdOn,
        LocalDate today,
        String senderName,
        String replyTo) {
}
