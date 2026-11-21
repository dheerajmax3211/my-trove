package com.personalplatform.askyourlife.ingest;

import java.time.Duration;

/** Exponential backoff, no jitter (deterministic): delay = min(max, base * 2^(attempt-1)). */
public record RetryPolicy(int maxAttempts, Duration base, Duration max) {

    public RetryPolicy {
        if (maxAttempts < 1 || base.isNegative() || max.compareTo(base) < 0) {
            throw new IllegalArgumentException("invalid retry policy");
        }
    }

    /** Delay before the next try after {@code attempt} failed attempts (1-based). */
    public Duration backoffAfter(int attempt) {
        int exponent = Math.min(Math.max(attempt - 1, 0), 30);
        long millis = base.toMillis() * (1L << exponent);
        if (millis < 0 || millis > max.toMillis()) {
            return max;
        }
        return Duration.ofMillis(millis);
    }

    public boolean exhausted(int attemptsMade) {
        return attemptsMade >= maxAttempts;
    }
}
