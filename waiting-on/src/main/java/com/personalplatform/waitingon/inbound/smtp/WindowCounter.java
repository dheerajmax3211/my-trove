package com.personalplatform.waitingon.inbound.smtp;

import java.time.Clock;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Fixed-window counter per key (an IP address): at most {@code limit} acquisitions per {@code window}. In memory and
 * per replica, which is the point: it stops one noisy source from flooding this listener, not a distributed attack
 * (that is the job of the MX / relay in front, see README).
 */
final class WindowCounter {

    private static final int PRUNE_ABOVE = 10_000;

    private record Window(long startMillis, int count) {
    }

    private final int limit;
    private final long windowMillis;
    private final Clock clock;
    private final Map<String, Window> windows = new HashMap<>();

    WindowCounter(int limit, Duration window, Clock clock) {
        this.limit = limit;
        this.windowMillis = window.toMillis();
        this.clock = clock;
    }

    synchronized boolean tryAcquire(String key) {
        long now = clock.millis();
        if (windows.size() > PRUNE_ABOVE) {
            windows.values().removeIf(w -> now - w.startMillis() >= windowMillis);
        }
        Window w = windows.get(key);
        if (w == null || now - w.startMillis() >= windowMillis) {
            windows.put(key, new Window(now, 1));
            return true;
        }
        if (w.count() >= limit) {
            return false;
        }
        windows.put(key, new Window(w.startMillis(), w.count() + 1));
        return true;
    }
}
