package com.personalplatform.platform.analytics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import org.junit.jupiter.api.Test;

class PercentilesTest {

    // bucket upper bounds: 10, 25, 50, 100, 250, 500, 1000, 2500, +Inf (counts are disjoint)

    @Test
    void interpolatesLinearlyInsideTheBucketThatHoldsTheRank() {
        // 100 requests all in (10, 25]: the median sits halfway, p100 at the upper bound
        long[] counts = {0, 100, 0, 0, 0, 0, 0, 0, 0};
        assertThat(Percentiles.estimate(counts, 25, 0.50)).isCloseTo(17.5, within(1e-9));
        assertThat(Percentiles.estimate(counts, 25, 1.00)).isCloseTo(25.0, within(1e-9));
    }

    @Test
    void walksAcrossBucketsUsingTheCumulativeCount() {
        // 90 in (10, 25], 5 in (250, 500], 5 in (500, 1000]
        long[] counts = {0, 90, 0, 0, 0, 5, 5, 0, 0};
        double p50 = Percentiles.estimate(counts, 800, 0.50);
        assertThat(p50).isCloseTo(10 + 15 * 50.0 / 90, within(1e-9));
        assertThat(p50).isBetween(10.0, 25.0);   // truth is 20
        // rank 95 is the last request of the (250, 500] bucket
        double p95 = Percentiles.estimate(counts, 800, 0.95);
        assertThat(p95).isCloseTo(500.0, within(1e-9));
        assertThat(p95).isBetween(250.0, 500.0);   // truth is 300
        // rank 99 falls in (500, 1000]: 500 + 500 * (99 - 95) / 5
        assertThat(Percentiles.estimate(counts, 800, 0.99)).isBetween(500.0, 800.0);
    }

    @Test
    void neverExceedsTheObservedMaximum() {
        long[] counts = {1, 0, 0, 0, 0, 0, 0, 0, 0};
        assertThat(Percentiles.estimate(counts, 3, 0.95)).isLessThanOrEqualTo(3.0);
        long[] one = {0, 0, 0, 0, 0, 0, 1, 0, 0};
        assertThat(Percentiles.estimate(one, 700, 0.99)).isLessThanOrEqualTo(700.0);
    }

    @Test
    void theOpenEndedBucketIsBoundedByTheObservedMaximum() {
        long[] counts = {0, 0, 0, 0, 0, 0, 0, 0, 10};
        double p95 = Percentiles.estimate(counts, 4000, 0.95);
        assertThat(p95).isBetween(2500.0, 4000.0);
        assertThat(Percentiles.estimate(counts, 4000, 1.0)).isCloseTo(4000.0, within(1e-9));
    }

    @Test
    void anEmptyHistogramHasNoPercentile() {
        assertThatThrownBy(() -> Percentiles.estimate(new long[9], 0, 0.5)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void theErrorIsAtMostOneBucketWideForEveryQuantile() {
        // 1000 synthetic latencies, bucketed the way the aggregates do
        long[] counts = new long[9];
        long[] bounds = Percentiles.UPPER_BOUNDS_MS;
        java.util.Random random = new java.util.Random(42);
        int[] latencies = new int[1000];
        int max = 0;
        for (int i = 0; i < latencies.length; i++) {
            latencies[i] = (int) Math.min(5000, Math.round(Math.exp(random.nextGaussian() * 1.2 + 4.0)));
            max = Math.max(max, latencies[i]);
            int b = 0;
            while (b < bounds.length && latencies[i] > bounds[b]) {
                b++;
            }
            counts[b]++;
        }
        java.util.Arrays.sort(latencies);
        for (double q : new double[] {0.5, 0.9, 0.95, 0.99}) {
            double truth = latencies[(int) Math.ceil(q * latencies.length) - 1];
            double estimate = Percentiles.estimate(counts, max, q);
            int b = 0;
            while (b < bounds.length && truth > bounds[b]) {
                b++;
            }
            double lower = b == 0 ? 0 : bounds[b - 1];
            double upper = b < bounds.length ? bounds[b] : max;
            assertThat(estimate).as("q=%s truth=%s", q, truth).isBetween(lower, upper);
            assertThat(Math.abs(estimate - truth)).isLessThanOrEqualTo(upper - lower);
        }
    }
}
