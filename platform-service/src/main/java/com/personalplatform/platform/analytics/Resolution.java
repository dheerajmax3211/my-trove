package com.personalplatform.platform.analytics;

import java.time.Duration;
import java.time.Instant;

/**
 * Which continuous aggregate answers a query: the finest one that keeps the series short and whose retention still
 * covers the start of the range (1 minute rollups are kept 30 days, hourly 365 days, daily 5 years).
 */
enum Resolution {

    ONE_MINUTE("usage_1m", "1m", 60, Duration.ofDays(30)),
    ONE_HOUR("usage_1h", "1h", 3600, Duration.ofDays(365)),
    ONE_DAY("usage_1d", "1d", 86400, Duration.ofDays(1825));

    private static final Duration MINUTE_UP_TO = Duration.ofHours(3);
    private static final Duration HOUR_UP_TO = Duration.ofDays(14);

    private final String view;
    private final String label;
    private final long bucketSeconds;
    private final Duration retention;

    Resolution(String view, String label, long bucketSeconds, Duration retention) {
        this.view = view;
        this.label = label;
        this.bucketSeconds = bucketSeconds;
        this.retention = retention;
    }

    String view() {
        return view;
    }

    String label() {
        return label;
    }

    /** The start of the bucket containing {@code instant} (all buckets are aligned to UTC midnight). */
    Instant floor(Instant instant) {
        return Instant.ofEpochSecond(Math.floorDiv(instant.getEpochSecond(), bucketSeconds) * bucketSeconds);
    }

    static Resolution forRange(Instant from, Instant to, Instant now) {
        Duration length = Duration.between(from, to);
        Resolution r = length.compareTo(MINUTE_UP_TO) <= 0 ? ONE_MINUTE : length.compareTo(HOUR_UP_TO) <= 0 ? ONE_HOUR : ONE_DAY;
        // a short window far in the past: the fine rollups are already gone, the coarser ones still hold it
        while (r != ONE_DAY && from.isBefore(now.minus(r.retention))) {
            r = values()[r.ordinal() + 1];
        }
        return r;
    }
}
