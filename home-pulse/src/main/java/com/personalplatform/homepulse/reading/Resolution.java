package com.personalplatform.homepulse.reading;

import java.time.Duration;

/** Which table answers a readings query, chosen from the size of the requested range. */
public enum Resolution {
    /** The hypertable itself. */
    RAW(Duration.ofSeconds(1)),
    /** 1-minute continuous aggregate. */
    ONE_MINUTE(Duration.ofMinutes(1)),
    /** 1-hour continuous aggregate. */
    ONE_HOUR(Duration.ofHours(1)),
    /** Daily buckets computed on top of the hourly aggregate. */
    ONE_DAY(Duration.ofDays(1));

    /** Hard cap on points returned for one query. */
    public static final int MAX_POINTS = 5000;

    private final Duration bucket;

    Resolution(Duration bucket) {
        this.bucket = bucket;
    }

    public Duration bucket() {
        return bucket;
    }

    /** Upper bound of points a range would produce at this resolution. */
    public long pointsFor(Duration range) {
        return range.toSeconds() / bucket.toSeconds() + 1;
    }

    /**
     * Picks the finest resolution that keeps the answer comfortably small: up to 1 h raw, up to 2 days per minute,
     * up to 60 days per hour, beyond that per day. Pure so it can be unit tested exhaustively.
     */
    public static Resolution choose(Duration range) {
        if (range.compareTo(Duration.ofHours(1)) <= 0) {
            return RAW;
        }
        if (range.compareTo(Duration.ofDays(2)) <= 0) {
            return ONE_MINUTE;
        }
        if (range.compareTo(Duration.ofDays(60)) <= 0) {
            return ONE_HOUR;
        }
        return ONE_DAY;
    }
}
