package com.personalplatform.gateway.ratelimit;

import com.personalplatform.gateway.config.GatewayProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

/**
 * Monthly quota check. A principal's usage so far this month is read from {@code platform-service} and cached for
 * 30 s; between refreshes the gateway adds the requests it has admitted itself, so a burst cannot overshoot by more
 * than the cache window's worth of other gateways' traffic (there is one gateway). The read happens in the
 * background: a request never waits for it. Cold cache, an unreachable service, or a figure older than
 * {@code max-stale} all mean "admit" (fail open).
 */
@Component
public class QuotaClient {

    /** Monthly allowance and usage so far, as platform-service reports them. A limit of 0 or less means unlimited. */
    public record Quota(long monthlyLimit, long used) {}

    public record Verdict(boolean exceeded, long limit, long used) {

        static final Verdict ADMIT = new Verdict(false, 0, 0);
    }

    private static final Logger log = LoggerFactory.getLogger(QuotaClient.class);

    private static final class Entry {
        volatile Quota quota;
        volatile Instant fetchedAt = Instant.MIN;
        volatile Instant nextRefresh = Instant.MIN;
        final AtomicLong admittedSinceFetch = new AtomicLong();
        final AtomicBoolean refreshing = new AtomicBoolean();
    }

    private final Clock clock;
    private final Duration ttl;
    private final Duration backoff;
    private final Duration maxStale;
    private final int maxEntries;
    private final Function<String, Mono<Quota>> fetcher;
    private final Map<String, Entry> entries = new LinkedHashMap<>();

    @Autowired
    public QuotaClient(Clock clock, GatewayProperties props, PlatformClient platform) {
        this(clock, props.rateLimit().quotaCacheTtl(), props.rateLimit().failureBackoff(),
                props.rateLimit().maxStale(), props.rateLimit().maxBuckets(), platform::quota);
    }

    public QuotaClient(Clock clock, Duration ttl, Duration backoff, Duration maxStale, int maxEntries,
            Function<String, Mono<Quota>> fetcher) {
        this.clock = clock;
        this.ttl = ttl;
        this.backoff = backoff;
        this.maxStale = maxStale;
        this.maxEntries = maxEntries;
        this.fetcher = fetcher;
    }

    /** Counts this request against the principal's month and says whether it is over the allowance. */
    public Verdict admit(String principalId) {
        Instant now = clock.instant();
        Entry entry = entry(principalId);
        if (!now.isBefore(entry.nextRefresh)) {
            refresh(principalId, entry, now);
        }
        Quota quota = entry.quota;
        if (quota == null || quota.monthlyLimit() <= 0 || now.isAfter(entry.fetchedAt.plus(maxStale))) {
            return Verdict.ADMIT;
        }
        long used = quota.used() + entry.admittedSinceFetch.get();
        if (used >= quota.monthlyLimit()) {
            return new Verdict(true, quota.monthlyLimit(), used);
        }
        entry.admittedSinceFetch.incrementAndGet();
        return new Verdict(false, quota.monthlyLimit(), used + 1);
    }

    private void refresh(String principalId, Entry entry, Instant now) {
        if (!entry.refreshing.compareAndSet(false, true)) {
            return;
        }
        entry.nextRefresh = now.plus(backoff); // until the call answers; replaced below
        Mono<Quota> call;
        try {
            call = fetcher.apply(principalId);
        } catch (RuntimeException e) {
            entry.refreshing.set(false);
            return;
        }
        call.doFinally(s -> entry.refreshing.set(false))
                .subscribe(q -> {
                    Instant at = clock.instant();
                    entry.quota = q;
                    entry.fetchedAt = at;
                    entry.admittedSinceFetch.set(0);
                    entry.nextRefresh = at.plus(ttl);
                }, e -> log.debug("quota not refreshed for a principal: {}", e.toString()));
    }

    private Entry entry(String principalId) {
        synchronized (entries) {
            Entry e = entries.get(principalId);
            if (e == null) {
                while (entries.size() >= maxEntries) {
                    var oldest = entries.keySet().iterator();
                    oldest.next();
                    oldest.remove();
                }
                e = new Entry();
                entries.put(principalId, e);
            }
            return e;
        }
    }

    public void clear() {
        synchronized (entries) {
            entries.clear();
        }
    }

    /** Seconds from {@code now} to 00:00 UTC on the first day of next month: when the monthly counter restarts. */
    public static long secondsUntilNextMonth(Instant now) {
        var next = now.atZone(ZoneOffset.UTC).toLocalDate().withDayOfMonth(1).plusMonths(1).atStartOfDay(ZoneOffset.UTC);
        return Math.max(1, Duration.between(now, next.toInstant()).getSeconds());
    }
}
