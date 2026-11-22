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
        /** The record the date (and the reminder) comes from: never guessed by the client. */
        Source source,
        LocalDate dueDate,
        long daysUntil,
        boolean highPriority,
        String message) {

    /** Where a reminder comes from, in the owner's terms: a date they typed, or a live sensor alert. */
    public enum Source {
        /** The appliance's next service date. */
        SERVICE_DATE,
        /** The appliance's warranty end date. */
        WARRANTY_DATE,
        /** A live anomaly alert from the sensor (the date is the warranty end it is measured against). */
        ALERT
    }

    public enum Type {
        SERVICE_OVERDUE,
        SERVICE_DUE,
        WARRANTY_ENDING,
        /** A live anomaly alert exists while the warranty still runs: claim before it ends. */
        WARRANTY_CLAIM_WINDOW
    }
}
