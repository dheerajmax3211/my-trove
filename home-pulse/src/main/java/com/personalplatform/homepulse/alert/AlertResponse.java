package com.personalplatform.homepulse.alert;

import com.personalplatform.homepulse.detect.AlertKind;
import com.personalplatform.homepulse.detect.DecidedBy;
import com.personalplatform.homepulse.detect.Severity;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

/** An alert together with the appliance's warranty and service context, so the owner can act on it. */
public record AlertResponse(
        UUID id,
        UUID applianceId,
        String applianceName,
        AlertKind kind,
        Severity severity,
        AlertStatus status,
        String message,
        Map<String, Object> evidence,
        Instant openedAt,
        Instant updatedAt,
        Instant acknowledgedAt,
        Instant resolvedAt,
        boolean underWarranty,
        LocalDate warrantyEndDate,
        Long daysToWarrantyEnd,
        LocalDate lastServiceDate,
        LocalDate nextServiceDate,
        boolean serviceOverdue,
        boolean simulated,
        // which model made the latest decision: MAD (built-in detector) or ML (ml-service)
        DecidedBy decidedBy) {

    public static AlertResponse from(Alert a, LocalDate today) {
        boolean warranty = a.warrantyEndDate() != null && !a.warrantyEndDate().isBefore(today);
        Long days = a.warrantyEndDate() == null ? null : ChronoUnit.DAYS.between(today, a.warrantyEndDate());
        boolean overdue = a.nextServiceDate() != null && a.nextServiceDate().isBefore(today);
        return new AlertResponse(a.id(), a.applianceId(), a.applianceName(), a.kind(), a.severity(), a.status(),
                a.message(), a.evidence(), a.openedAt(), a.updatedAt(), a.acknowledgedAt(), a.resolvedAt(),
                warranty, a.warrantyEndDate(), days, a.lastServiceDate(), a.nextServiceDate(), overdue, a.simulated(),
                a.decidedBy());
    }
}
