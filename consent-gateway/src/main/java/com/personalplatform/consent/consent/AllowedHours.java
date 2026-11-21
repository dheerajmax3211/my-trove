package com.personalplatform.consent.consent;

import com.personalplatform.consent.policy.TimeWindow;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.time.DateTimeException;
import java.time.ZoneId;

/** API form of {@link TimeWindow}: allowed hours of day, {@code startHour} inclusive, {@code endHour} exclusive. */
public record AllowedHours(@Min(0) @Max(23) int startHour, @Min(0) @Max(24) int endHour, String zone) {

    public TimeWindow toWindow() {
        try {
            return new TimeWindow(startHour, endHour, ZoneId.of(zone == null || zone.isBlank() ? "UTC" : zone));
        } catch (DateTimeException e) {
            throw new IllegalArgumentException("Unknown time zone: " + zone);
        }
    }

    public static AllowedHours of(TimeWindow w) {
        return w == null ? null : new AllowedHours(w.startHour(), w.endHour(), w.zone().getId());
    }
}
