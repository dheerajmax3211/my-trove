package com.personalplatform.platform.analytics;

/**
 * Latency percentiles from the histogram the continuous aggregates store, without the Timescale toolkit extension.
 *
 * <p>Each request is counted in one of nine disjoint buckets with inclusive upper bounds 10, 25, 50, 100, 250, 500, 1000,
 * 2500 ms and +Inf (the bucket ids are the {@code lat_*} columns). To estimate quantile q the rank {@code q * N} is
 * located in the cumulative counts and the value is interpolated linearly between the bucket's bounds, assuming the
 * requests are spread evenly inside it. The open-ended last bucket is bounded above by the largest latency seen.
 *
 * <p><b>Accuracy:</b> the true quantile lies in the same bucket as the estimate (the bucket is found exactly), so the
 * error is at most that bucket's width: 5 to 25 ms for the fast buckets, up to 250 ms in (250, 500], 500 ms in
 * (500, 1000], 1500 ms in (1000, 2500]. The estimate is also clamped to the observed maximum.
 */
final class Percentiles {

    /** Inclusive upper bounds of the first eight buckets; the ninth is open ended. */
    static final long[] UPPER_BOUNDS_MS = {10, 25, 50, 100, 250, 500, 1000, 2500};

    private Percentiles() {
    }

    /**
     * @param counts per-bucket request counts, {@code UPPER_BOUNDS_MS.length + 1} entries
     * @param maxMs the largest latency observed in the same data
     * @param q the quantile, in (0, 1]
     * @throws IllegalArgumentException when there are no requests (a percentile of nothing is undefined)
     */
    static double estimate(long[] counts, long maxMs, double q) {
        long total = 0;
        for (long c : counts) {
            total += c;
        }
        if (total == 0) {
            throw new IllegalArgumentException("no requests");
        }
        double rank = q * total;
        long before = 0;
        for (int i = 0; i < counts.length; i++) {
            long c = counts[i];
            if (c > 0 && before + c >= rank) {
                double lower = i == 0 ? 0 : UPPER_BOUNDS_MS[i - 1];
                double upper = i < UPPER_BOUNDS_MS.length ? UPPER_BOUNDS_MS[i] : Math.max(maxMs, UPPER_BOUNDS_MS[i - 1]);
                return Math.min(lower + (upper - lower) * (rank - before) / c, maxMs);
            }
            before += c;
        }
        return maxMs;
    }
}
