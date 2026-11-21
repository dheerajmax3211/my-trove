package com.personalplatform.homepulse.detect;

import java.util.Arrays;
import java.util.List;

/** Small robust-statistics toolbox (median, percentile, MAD). Pure and allocation-light. */
final class RobustStats {

    /** Converts MAD into a standard-deviation-equivalent for roughly normal data. */
    static final double MAD_TO_SIGMA = 1.4826;

    private RobustStats() {}

    static double median(double[] values) {
        return percentile(values, 0.5);
    }

    static double median(List<Double> values) {
        return median(toArray(values));
    }

    /** Linear-interpolated percentile, {@code p} in [0,1]. NaN for an empty input. */
    static double percentile(double[] values, double p) {
        if (values.length == 0) {
            return Double.NaN;
        }
        double[] sorted = values.clone();
        Arrays.sort(sorted);
        double rank = p * (sorted.length - 1);
        int lo = (int) Math.floor(rank);
        int hi = (int) Math.ceil(rank);
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
    }

    /** Robust standard deviation: 1.4826 * median(|x - median(x)|). */
    static double robustSigma(double[] values) {
        if (values.length == 0) {
            return Double.NaN;
        }
        double med = median(values);
        double[] dev = new double[values.length];
        for (int i = 0; i < values.length; i++) {
            dev[i] = Math.abs(values[i] - med);
        }
        return MAD_TO_SIGMA * median(dev);
    }

    static double[] toArray(List<Double> values) {
        double[] out = new double[values.size()];
        for (int i = 0; i < out.length; i++) {
            out[i] = values.get(i);
        }
        return out;
    }
}
