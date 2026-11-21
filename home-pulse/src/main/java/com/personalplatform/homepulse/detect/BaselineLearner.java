package com.personalplatform.homepulse.detect;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Learns an appliance's normal signature from a period of 1-minute samples. Pure and deterministic.
 * The learning period is expected to be a healthy one (the owner can re-learn after a repair).
 */
public final class BaselineLearner {

    /** Fewer valid comparison windows than this and there is not enough evidence to call anything "normal". */
    public static final int MIN_WINDOWS = 8;

    private BaselineLearner() {}

    /** Samples outside [from, to) are ignored. Empty when there is not enough usable data. */
    public static Optional<Baseline> learn(List<MinuteSample> samples, DetectorProfile profile, Instant from, Instant to) {
        List<MinuteSample> in = samples.stream()
                .filter(s -> !s.ts().isBefore(from) && s.ts().isBefore(to))
                .sorted(java.util.Comparator.comparing(MinuteSample::ts))
                .toList();
        if (in.size() < MIN_WINDOWS * 30) {
            return Optional.empty();
        }
        double[] watts = in.stream().mapToDouble(MinuteSample::watts).toArray();
        double standby = RobustStats.percentile(watts, 0.10);
        double peak = RobustStats.percentile(watts, 0.99);
        double swing = peak - standby;
        boolean switching = peak >= 15 && swing >= Math.max(10, 0.25 * peak);
        double onThreshold = switching ? standby + profile.onFraction() * swing : 0.0;

        List<Double> onLevels = new ArrayList<>();
        List<Double> duties = new ArrayList<>();
        List<Double> cycles = new ArrayList<>();
        int windows = 0;
        Duration w = Duration.ofMinutes(profile.windowMinutes());
        for (Instant start = from; !start.plus(w).isAfter(to); start = start.plus(w)) {
            WindowStats ws = WindowStats.compute(in, start, start.plus(w), onThreshold);
            if (!ws.valid(profile.minWindowCoverage())) {
                continue;
            }
            windows++;
            duties.add(ws.duty());
            if (!Double.isNaN(ws.onLevel())) {
                onLevels.add(ws.onLevel());
            }
            if (!Double.isNaN(ws.meanRunMinutes())) {
                cycles.add(ws.meanRunMinutes());
            }
        }
        if (windows < MIN_WINDOWS || onLevels.size() < MIN_WINDOWS / 2) {
            return Optional.empty();
        }
        List<Double> onRuns = new ArrayList<>();
        List<Double> offRuns = new ArrayList<>();
        if (switching) {
            for (Runs.Run r : Runs.scan(in, onThreshold)) {
                if (r.completed()) {
                    (r.on() ? onRuns : offRuns).add(r.minutes());
                }
            }
        }
        double[] onLevelArr = RobustStats.toArray(onLevels);
        double[] dutyArr = RobustStats.toArray(duties);
        double[] cycleArr = RobustStats.toArray(cycles);
        return Optional.of(new Baseline(
                standby, peak, onThreshold, switching,
                RobustStats.median(onLevelArr), RobustStats.robustSigma(onLevelArr),
                RobustStats.median(dutyArr), RobustStats.robustSigma(dutyArr),
                cycles.isEmpty() ? 0 : RobustStats.median(cycleArr),
                cycles.isEmpty() ? 0 : RobustStats.robustSigma(cycleArr),
                onRuns.isEmpty() ? 0 : RobustStats.percentile(RobustStats.toArray(onRuns), 0.99),
                offRuns.isEmpty() ? 0 : RobustStats.percentile(RobustStats.toArray(offRuns), 0.99),
                windows, from, to));
    }
}
