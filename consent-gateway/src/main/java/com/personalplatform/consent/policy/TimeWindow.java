package com.personalplatform.consent.policy;

import java.time.Instant;
import java.time.ZoneId;

/**
 * Allowed hours of day in a zone: {@code startHour} inclusive, {@code endHour} exclusive. {@code start > end} wraps
 * midnight (22 -> 6 means 22:00-06:00). {@code endHour} may be 24 ("until midnight").
 */
public record TimeWindow(int startHour, int endHour, ZoneId zone) {

    public TimeWindow {
        if (startHour < 0 || startHour > 23) {
            throw new IllegalArgumentException("startHour must be 0-23");
        }
        if (endHour < 0 || endHour > 24) {
            throw new IllegalArgumentException("endHour must be 0-24");
        }
        if (startHour == endHour) {
            throw new IllegalArgumentException("startHour and endHour must differ");
        }
        if (zone == null) {
            throw new IllegalArgumentException("zone is required");
        }
    }

    public boolean contains(Instant instant) {
        int hour = instant.atZone(zone).getHour();
        return startHour < endHour
                ? hour >= startHour && hour < endHour
                : hour >= startHour || hour < endHour;
    }
}
