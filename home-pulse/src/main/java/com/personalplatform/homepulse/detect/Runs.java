package com.personalplatform.homepulse.detect;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Splits a time-ordered sample list into maximal runs of the same ON/OFF state. A gap of more than
 * {@link DetectorProfile#MAX_GAP_MINUTES} minutes always ends a run (we do not guess across missing data).
 */
final class Runs {

    /**
     * @param on           state of the run
     * @param first        timestamp of the first sample
     * @param last         timestamp of the last sample
     * @param leftBounded  directly preceded (no gap) by a sample of the opposite state
     * @param rightBounded directly followed (no gap) by a sample of the opposite state
     */
    record Run(boolean on, Instant first, Instant last, boolean leftBounded, boolean rightBounded) {

        /** Length in minutes, counting the minute of the last sample. */
        double minutes() {
            return Duration.between(first, last).toSeconds() / 60.0 + 1;
        }

        boolean completed() {
            return leftBounded && rightBounded;
        }
    }

    private Runs() {}

    static List<Run> scan(List<MinuteSample> samples, double onThreshold) {
        List<Run> runs = new ArrayList<>();
        int i = 0;
        int n = samples.size();
        while (i < n) {
            boolean on = samples.get(i).watts() >= onThreshold;
            int j = i;
            while (j + 1 < n
                    && contiguous(samples.get(j), samples.get(j + 1))
                    && (samples.get(j + 1).watts() >= onThreshold) == on) {
                j++;
            }
            boolean left = i > 0 && contiguous(samples.get(i - 1), samples.get(i));
            boolean right = j + 1 < n && contiguous(samples.get(j), samples.get(j + 1));
            runs.add(new Run(on, samples.get(i).ts(), samples.get(j).ts(), left, right));
            i = j + 1;
        }
        return runs;
    }

    static boolean contiguous(MinuteSample a, MinuteSample b) {
        return Duration.between(a.ts(), b.ts()).toMinutes() <= DetectorProfile.MAX_GAP_MINUTES;
    }
}
