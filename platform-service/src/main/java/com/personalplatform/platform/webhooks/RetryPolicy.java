package com.personalplatform.platform.webhooks;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

/**
 * Retry schedule for a failed delivery: the wait after failed attempt 1 is one minute, then five minutes, thirty minutes,
 * two hours and twelve hours. After the sixth failed attempt the delivery is dead (kept in the log, replayable by hand).
 */
public final class RetryPolicy {

    public static final int MAX_ATTEMPTS = 6;

    private static final List<Duration> WAITS = List.of(
            Duration.ofMinutes(1), Duration.ofMinutes(5), Duration.ofMinutes(30), Duration.ofHours(2), Duration.ofHours(12));

    private RetryPolicy() {}

    /**
     * The wait before the next attempt, given how many attempts have failed so far; empty when the delivery is dead.
     *
     * @throws IllegalArgumentException when no attempt has failed yet
     */
    public static Optional<Duration> afterFailure(int failedAttempts) {
        if (failedAttempts < 1) {
            throw new IllegalArgumentException("failedAttempts must be at least 1");
        }
        if (failedAttempts >= MAX_ATTEMPTS) {
            return Optional.empty();
        }
        return Optional.of(WAITS.get(failedAttempts - 1));
    }
}
