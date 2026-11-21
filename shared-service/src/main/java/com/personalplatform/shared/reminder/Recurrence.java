package com.personalplatform.shared.reminder;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;

/**
 * "Every {@code interval} DAYS/WEEKS/MONTHS", computed in UTC from a fixed anchor so a monthly rule on the 31st
 * yields Jan 31, Feb 28, Mar 31 (no drift). If the scheduler was down, missed occurrences are skipped: the next
 * occurrence is the first anchor-aligned instant strictly after {@code after}.
 */
public record Recurrence(Unit unit, int interval) {

    public enum Unit {
        DAILY(ChronoUnit.DAYS, 1),
        WEEKLY(ChronoUnit.DAYS, 7),
        MONTHLY(ChronoUnit.MONTHS, 1);

        private final ChronoUnit chrono;
        private final int multiplier;

        Unit(ChronoUnit chrono, int multiplier) {
            this.chrono = chrono;
            this.multiplier = multiplier;
        }
    }

    public Recurrence {
        if (unit == null || interval < 1) {
            throw new IllegalArgumentException("recurrence needs a unit and an interval >= 1");
        }
    }

    /** First occurrence of this rule, aligned to {@code anchor}, that is strictly after {@code after}. */
    public Instant nextAfter(Instant anchor, Instant after) {
        ZonedDateTime a = anchor.atZone(ZoneOffset.UTC);
        long step = (long) interval * unit.multiplier;
        long approx = unit.chrono.between(a, after.atZone(ZoneOffset.UTC)) / step;
        long k = Math.max(approx - 1, 0);
        Instant candidate = a.plus(k * step, unit.chrono).toInstant();
        while (!candidate.isAfter(after)) {
            k++;
            candidate = a.plus(k * step, unit.chrono).toInstant();
        }
        return candidate;
    }
}
