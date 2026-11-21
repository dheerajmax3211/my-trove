package com.personalplatform.homepulse.reminder;

import java.time.LocalDate;
import java.util.UUID;

/**
 * @param daysUntil negative when overdue
 * @param highPriority true when a live anomaly alert makes acting on this date more valuable
 */
public record Reminder(
        UUID applianceId,
        String applianceName,
        Type type,
        LocalDate dueDate,
        long daysUntil,
        boolean highPriority,
        String message) {

    public enum Type {
        SERVICE_OVERDUE,
        SERVICE_DUE,
        WARRANTY_ENDING,
        /** A live anomaly alert exists while the warranty still runs: claim before it ends. */
        WARRANTY_CLAIM_WINDOW
    }
}
