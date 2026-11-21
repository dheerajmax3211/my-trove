package com.personalplatform.legacy.protocol;

import java.time.Duration;
import java.time.Instant;

/** Vacation-pause accounting inside a rolling window. */
public record PauseLedger(Instant windowStart, long usedSeconds) {

    public static final Duration WINDOW = Duration.ofDays(365);

    public static PauseLedger empty() {
        return new PauseLedger(null, 0);
    }

    /** The ledger as seen at {@code now}: a window older than a year starts over. */
    public PauseLedger at(Instant now) {
        if (windowStart == null || !now.isBefore(windowStart.plus(WINDOW))) {
            return new PauseLedger(now, 0);
        }
        return this;
    }
}
