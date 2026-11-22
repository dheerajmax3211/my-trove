package com.personalplatform.homepulse.reading;

import com.personalplatform.homepulse.detect.MinuteSample;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Carries a reading forward over short gaps in the 1-minute series so that a sensor reporting every few minutes
 * (a 5-minute smart plug, the built-in simulator) is judged like one reporting every minute: the detector skips
 * windows with less than 70% of their minutes present and ends a run at a gap of more than 3 minutes.
 * Only gaps of up to {@link #MAX_FILL_MINUTES} missing minutes are bridged; a real outage (a power cut, a silent
 * sensor) stays a gap. Pure and deterministic.
 */
public final class SampleGapFill {

    /** A sample is held for at most this many minutes (so a 5-minute cadence is covered completely). */
    public static final int MAX_FILL_MINUTES = 4;

    private SampleGapFill() {}

    /** {@code samples} sorted by time; no filled minute is placed at or after {@code to}. */
    public static List<MinuteSample> fill(List<MinuteSample> samples, Instant to) {
        List<MinuteSample> out = new ArrayList<>(samples.size() * 2);
        for (int i = 0; i < samples.size(); i++) {
            MinuteSample s = samples.get(i);
            out.add(s);
            Instant limit = i + 1 < samples.size() ? samples.get(i + 1).ts() : to;
            for (int m = 1; m <= MAX_FILL_MINUTES; m++) {
                Instant ts = s.ts().plus(Duration.ofMinutes(m));
                if (!ts.isBefore(limit)) {
                    break;
                }
                out.add(new MinuteSample(ts, s.watts()));
            }
        }
        return out;
    }
}
