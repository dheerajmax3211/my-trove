package com.personalplatform.platform.analytics;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Response bodies of the usage analytics API. */
public final class Dtos {

    private Dtos() {
    }

    /**
     * @param errorRate share of requests answered with a 5xx (client errors such as 401 / 403 / 429 are visible in
     *                  {@code byStatusClass}); 0 when there were no requests
     * @param p50Ms estimated median latency, null when there were no requests (see {@link Percentiles} for the accuracy)
     * @param p95Ms estimated 95th percentile latency, null when there were no requests
     * @param activeUsers distinct USER principals with at least one request
     * @param byStatusClass requests per status class, only classes that saw traffic: {@code "2xx": n, ...}
     * @param series one point per bucket that saw traffic, oldest first
     * @param from start of the queried range (the first bucket may begin earlier: ranges are applied at bucket granularity)
     * @param to end of the queried range
     * @param resolution the aggregate that answered: {@code 1m}, {@code 1h} or {@code 1d}
     */
    public record UsageSummary(long totalRequests, double errorRate, Double p50Ms, Double p95Ms, long activeUsers,
                               List<ServiceUsage> byService, Map<String, Long> byStatusClass, List<SeriesPoint> series,
                               Instant from, Instant to, String resolution) {
    }

    public record ServiceUsage(String service, long requests, long errors) {
    }

    public record SeriesPoint(Instant ts, long requests, long errors) {
    }

    public record TopUser(String principalType, String principalId, long requests, long errors) {
    }
}
