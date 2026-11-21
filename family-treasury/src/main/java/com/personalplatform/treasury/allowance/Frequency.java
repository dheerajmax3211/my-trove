package com.personalplatform.treasury.allowance;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/**
 * Period arithmetic for allowance schedules. Period k starts at {@code anchor + k * unit}. For MONTHLY it is always
 * derived from the ORIGINAL anchor, so an anchor of Jan 31 gives Feb 28/29, Mar 31, Apr 30... (no day drift).
 */
public enum Frequency {
    WEEKLY, MONTHLY;

    public LocalDate periodStart(LocalDate anchor, long index) {
        return this == WEEKLY ? anchor.plusWeeks(index) : anchor.plusMonths(index);
    }

    /** Index of the latest period starting on or before {@code date}; -1 if the anchor is still in the future. */
    public long latestIndexOnOrBefore(LocalDate anchor, LocalDate date) {
        if (date.isBefore(anchor)) {
            return -1;
        }
        if (this == WEEKLY) {
            return ChronoUnit.DAYS.between(anchor, date) / 7;
        }
        long k = ChronoUnit.MONTHS.between(anchor, date);
        return !periodStart(anchor, k + 1).isAfter(date) ? k + 1 : k;
    }
}
