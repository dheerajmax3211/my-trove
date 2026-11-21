package com.personalplatform.gateway.ratelimit;

import com.personalplatform.gateway.GatewayAttributes;
import com.personalplatform.gateway.Problems;
import com.personalplatform.gateway.config.GatewayProperties;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * Per-minute request limits, one Bucket4j bucket per key (a principal id or a client address), held in memory in a
 * bounded map. The window is fixed: the whole allowance comes back one minute after the bucket was created or last
 * emptied. A plan change takes effect by replacing the bucket. Single gateway instance by design (no Redis).
 */
@Component
public class RateLimiter {

    public static final String LIMIT_HEADER = "X-RateLimit-Limit";
    public static final String REMAINING_HEADER = "X-RateLimit-Remaining";

    public static final String RATE_LIMITED = "rate-limited";
    public static final String QUOTA_EXCEEDED = "quota-exceeded";

    public record Decision(boolean allowed, long limit, long remaining, long retryAfterSeconds) {}

    private record Live(int limit, Bucket bucket) {}

    private final int maxBuckets;
    private final Map<String, Live> buckets = new LinkedHashMap<>();

    public RateLimiter(GatewayProperties props) {
        this.maxBuckets = props.rateLimit().maxBuckets();
    }

    public Decision tryConsume(String key, int requestsPerMinute) {
        Bucket bucket = bucketFor(key, requestsPerMinute);
        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        if (probe.isConsumed()) {
            return new Decision(true, requestsPerMinute, probe.getRemainingTokens(), 0);
        }
        long wait = Math.max(1, Duration.ofNanos(probe.getNanosToWaitForRefill()).plusMillis(999).toSeconds());
        return new Decision(false, requestsPerMinute, 0, wait);
    }

    private Bucket bucketFor(String key, int limit) {
        synchronized (buckets) {
            Live live = buckets.get(key);
            if (live == null || live.limit() != limit) {
                while (live == null && buckets.size() >= maxBuckets) {
                    var oldest = buckets.keySet().iterator();
                    oldest.next();
                    oldest.remove();
                }
                live = new Live(limit, Bucket.builder()
                        .addLimit(Bandwidth.builder().capacity(limit).refillIntervally(limit, Duration.ofMinutes(1)).build())
                        .build());
                buckets.put(key, live);
            }
            return live.bucket();
        }
    }

    public void reset() {
        synchronized (buckets) {
            buckets.clear();
        }
    }

    /** Sets the rate-limit headers that tell a client where it stands. */
    public static void describe(ServerWebExchange exchange, Decision d) {
        exchange.getResponse().getHeaders().set(LIMIT_HEADER, Long.toString(d.limit()));
        exchange.getResponse().getHeaders().set(REMAINING_HEADER, Long.toString(d.remaining()));
    }

    /** 429 for an exhausted per-minute bucket. */
    public static Mono<Void> reject(ServerWebExchange exchange, Decision d) {
        exchange.getAttributes().put(GatewayAttributes.RATE_LIMITED, Boolean.TRUE);
        return Problems.write(exchange, HttpStatus.TOO_MANY_REQUESTS, RATE_LIMITED, "Too many requests",
                "Rate limit of " + d.limit() + " requests per minute reached. Retry in " + d.retryAfterSeconds() + " s.",
                Map.of("Retry-After", Long.toString(d.retryAfterSeconds()), LIMIT_HEADER, Long.toString(d.limit()),
                        REMAINING_HEADER, "0"));
    }

    /** 429 for an exhausted monthly allowance; a different problem type so clients can tell the two apart. */
    public static Mono<Void> rejectQuota(ServerWebExchange exchange, long monthlyLimit, long retryAfterSeconds) {
        exchange.getAttributes().put(GatewayAttributes.RATE_LIMITED, Boolean.TRUE);
        return Problems.write(exchange, HttpStatus.TOO_MANY_REQUESTS, QUOTA_EXCEEDED, "Monthly quota exceeded",
                "The monthly allowance of " + monthlyLimit + " requests is used up. It restarts at the start of next month (UTC).",
                Map.of("Retry-After", Long.toString(retryAfterSeconds), LIMIT_HEADER, Long.toString(monthlyLimit),
                        REMAINING_HEADER, "0"));
    }
}
