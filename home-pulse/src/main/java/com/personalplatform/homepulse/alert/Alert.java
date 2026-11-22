package com.personalplatform.homepulse.alert;

import com.personalplatform.homepulse.detect.AlertKind;
import com.personalplatform.homepulse.detect.Severity;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

public record Alert(
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
        LocalDate warrantyEndDate,
        LocalDate lastServiceDate,
        LocalDate nextServiceDate,
        boolean simulated) {}
