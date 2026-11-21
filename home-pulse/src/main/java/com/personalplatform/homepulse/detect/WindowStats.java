package com.personalplatform.homepulse.detect;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Electrical statistics of one comparison window. Shared by the learner and the detector so that "recent"
 * and "baseline" are measured with exactly the same ruler.
 *
 * @param duty           fraction of present minutes that were ON
 * @param onLevel        median power over ON minutes, NaN when fewer than {@link #MIN_ON_SAMPLES} ON minutes
 * @param meanRunMinutes mean length of completed ON runs, NaN when fewer than 2 completed runs
 */
record WindowStats(Instant start, Instant end, int samples, double coverage, double duty, double onLevel,
                   double meanRunMinutes) {

    static final int MIN_ON_SAMPLES = 5;

    boolean valid(double minCoverage) {
        return coverage >= minCoverage;
    }

    /** {@code samples} must be sorted by time; only those in [start, end) are used. */
    static WindowStats compute(List<MinuteSample> samples, Instant start, Instant end, double onThreshold) {
        List<MinuteSample> in = new ArrayList<>();
        for (MinuteSample s : samples) {
            if (!s.ts().isBefore(start) && s.ts().isBefore(end)) {
                in.add(s);
            }
        }
        double minutes = Duration.between(start, end).toMinutes();
        double coverage = minutes <= 0 ? 0 : Math.min(1.0, in.size() / minutes);
        if (in.isEmpty()) {
            return new WindowStats(start, end, 0, 0, Double.NaN, Double.NaN, Double.NaN);
        }
        List<Double> onWatts = new ArrayList<>();
        for (MinuteSample s : in) {
            if (s.watts() >= onThreshold) {
                onWatts.add(s.watts());
            }
        }
        double duty = (double) onWatts.size() / in.size();
        double onLevel = onWatts.size() >= MIN_ON_SAMPLES ? RobustStats.median(onWatts) : Double.NaN;
        List<Double> runLengths = new ArrayList<>();
        for (Runs.Run r : Runs.scan(in, onThreshold)) {
            if (r.on() && r.completed()) {
                runLengths.add(r.minutes());
            }
        }
        double meanRun = runLengths.size() >= 2
                ? runLengths.stream().mapToDouble(Double::doubleValue).average().orElse(Double.NaN)
                : Double.NaN;
        return new WindowStats(start, end, in.size(), coverage, duty, onLevel, meanRun);
    }
}
