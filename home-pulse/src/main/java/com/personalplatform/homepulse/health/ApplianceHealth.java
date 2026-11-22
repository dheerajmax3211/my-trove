package com.personalplatform.homepulse.health;

import com.personalplatform.homepulse.alert.AlertResponse;
import com.personalplatform.homepulse.detect.Baseline;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * @param status overall: CRITICAL / WARNING from live alerts, else LEARNING (no baseline yet), NO_DEVICE, or HEALTHY
 */
public record ApplianceHealth(
        UUID applianceId,
        String name,
        Status status,
        String baselineStatus,
        Instant baselineLearnedAt,
        Baseline baseline,
        Instant lastReadingAt,
        Last24h last24h,
        List<AlertResponse> activeAlerts,
        Service service,
        boolean simulated) {

    public enum Status { HEALTHY, WARNING, CRITICAL, LEARNING, NO_DEVICE }

    /** dutyPct is null when the baseline is not ready or the appliance does not switch. */
    public record Last24h(double avgWatts, double maxWatts, double energyKwh, Double dutyPct, long minutesWithData) {}

    public record Service(boolean underWarranty, LocalDate warrantyEndDate, Long daysToWarrantyEnd,
                          LocalDate lastServiceDate, LocalDate nextServiceDate, boolean serviceOverdue) {}
}
