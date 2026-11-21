package com.personalplatform.gateway.ratelimit;

import com.personalplatform.gateway.config.GatewayProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Requests per minute for each plan. Starts from the seed values (FREE 120, PRO 600, DEVELOPER 1,200) and is
 * refreshed in the background from {@code platform-service}; a request never waits for that call, and if the service
 * is unreachable the last known (or seed) values stay in force. A plan the table does not know is treated as FREE.
 */
@Component
public class PlanLimits {

    public static final String DEFAULT_PLAN = "FREE";

    private static final Logger log = LoggerFactory.getLogger(PlanLimits.class);
    private static final Map<String, Integer> SEED = Map.of("FREE", 120, "PRO", 600, "DEVELOPER", 1200);

    private final PlatformClient platform;
    private final Clock clock;
    private final Duration refreshEvery;
    private final Duration backoff;
    private final AtomicReference<Map<String, Integer>> current = new AtomicReference<>(SEED);
    private final AtomicBoolean refreshing = new AtomicBoolean();
    private volatile Instant nextRefresh = Instant.MIN;

    public PlanLimits(PlatformClient platform, Clock clock, GatewayProperties props) {
        this.platform = platform;
        this.clock = clock;
        this.refreshEvery = props.rateLimit().planRefresh();
        this.backoff = props.rateLimit().failureBackoff();
    }

    /** Requests per minute allowed on {@code plan}. */
    public int requestsPerMinute(String plan) {
        refreshInBackgroundIfDue();
        Map<String, Integer> limits = current.get();
        Integer limit = plan == null ? null : limits.get(plan);
        return limit != null ? limit : limits.getOrDefault(DEFAULT_PLAN, SEED.get(DEFAULT_PLAN));
    }

    private void refreshInBackgroundIfDue() {
        if (!platform.configured() || clock.instant().isBefore(nextRefresh) || !refreshing.compareAndSet(false, true)) {
            return;
        }
        platform.plans()
                .doFinally(s -> refreshing.set(false))
                .subscribe(this::apply, this::failed);
    }

    /** Synchronous refresh for start-up checks and tests. */
    public void reloadNow() {
        if (!platform.configured()) {
            return;
        }
        try {
            List<PlatformClient.PlanRow> rows = platform.plans().block(Duration.ofSeconds(5));
            if (rows != null) {
                apply(rows);
            }
        } catch (RuntimeException e) {
            failed(e);
        }
    }

    private void apply(List<PlatformClient.PlanRow> rows) {
        Map<String, Integer> next = new HashMap<>(SEED);
        rows.forEach(r -> next.put(r.plan(), r.requestsPerMinute()));
        current.set(Map.copyOf(next));
        nextRefresh = clock.instant().plus(refreshEvery);
    }

    private void failed(Throwable e) {
        nextRefresh = clock.instant().plus(backoff);
        log.warn("plan limits not refreshed, keeping the last known values: {}", e.toString());
    }
}
