package com.personalplatform.homepulse.detect;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Pure, deterministic anomaly detection for one appliance. No clock, no I/O: everything arrives as arguments.
 *
 * <p>Method: the learned {@link Baseline} holds robust statistics (medians and MAD-derived spreads) of per-window
 * features. The recent past is cut into comparison windows aligned backwards from {@code now}; each window is
 * measured with the same code as the baseline ({@link WindowStats}). A feature is reported only when it is
 * <em>sustained</em>: at least {@code sustainWindows} of the last {@code lookbackWindows} windows deviate in the
 * same direction by more than {@code max(k * sigma, relative tolerance, absolute floor)}, and the newest valid
 * window deviates too (so the condition clears promptly after a repair). Four detectors:
 * <ul>
 *   <li>POWER_SHIFT: median ON-state power vs baseline.</li>
 *   <li>DUTY_CYCLE_DRIFT: fraction of time ON, and mean length of ON cycles.</li>
 *   <li>STUCK_ON / STOPPED: the trailing ON (OFF) run is far longer than anything seen while learning.</li>
 *   <li>NO_DATA: silence.</li>
 * </ul>
 */
public final class AnomalyDetector {

    private static final double SPREAD_FLOOR_REL = 0.01;
    private static final double DUTY_ABS_FLOOR = 0.05;
    private static final double CYCLE_ABS_FLOOR_MIN = 4.0;
    private static final double RUN_LIMIT_FACTOR = 3.0;
    static final double LIVE_TOLERANCE_SCALE = 0.7;

    /**
     * @param findings  conditions seen now
     * @param evaluated kinds this run was actually able to judge (a kind that was not evaluated must not be
     *                  auto-resolved just because it is absent from {@code findings})
     */
    public record Evaluation(List<Finding> findings, Set<AlertKind> evaluated) {}

    private AnomalyDetector() {}

    /**
     * @param baseline learned signature, or null while still learning (only NO_DATA is judged then)
     * @param samples  recent 1-minute samples (any order, up to about 48 h)
     * @param lastSeen newest known reading time (or the device registration time when it never reported)
     */
    public static Evaluation evaluate(DetectorProfile p, Baseline baseline, List<MinuteSample> samples,
                                      Instant lastSeen, Instant now) {
        return evaluate(p, baseline, samples, lastSeen, now, Set.of());
    }

    /**
     * @param liveKinds kinds that currently have a live alert. Those use a tolerance reduced to
     *                  {@value #LIVE_TOLERANCE_SCALE} of normal (Schmitt-trigger hysteresis) so a value hovering at the
     *                  threshold does not open, resolve and re-open alerts all day.
     */
    public static Evaluation evaluate(DetectorProfile p, Baseline baseline, List<MinuteSample> samples,
                                      Instant lastSeen, Instant now, Set<AlertKind> liveKinds) {
        List<MinuteSample> sorted = samples.stream().sorted(Comparator.comparing(MinuteSample::ts)).toList();
        List<Finding> findings = new ArrayList<>();
        Set<AlertKind> evaluated = EnumSet.noneOf(AlertKind.class);

        Instant newest = lastSeen;
        if (!sorted.isEmpty() && (newest == null || sorted.get(sorted.size() - 1).ts().isAfter(newest))) {
            newest = sorted.get(sorted.size() - 1).ts();
        }
        evaluated.add(AlertKind.NO_DATA);
        long silentMinutes = newest == null ? Long.MAX_VALUE : Duration.between(newest, now).toMinutes();
        if (silentMinutes > p.noDataMinutes()) {
            Map<String, Object> ev = new LinkedHashMap<>();
            if (newest != null) {
                ev.put("lastSeen", newest.toString());
                ev.put("silentMinutes", silentMinutes);
            }
            ev.put("thresholdMinutes", p.noDataMinutes());
            Severity sev = silentMinutes >= 24 * 60 ? Severity.CRITICAL : Severity.WARNING;
            findings.add(new Finding(AlertKind.NO_DATA, sev,
                    newest == null ? "The sensor has never reported data."
                            : String.format(Locale.ROOT, "No readings for %s (last seen %s).", human(silentMinutes), newest),
                    ev));
            return new Evaluation(findings, evaluated);   // nothing else can be judged on stale data
        }
        if (baseline == null) {
            return new Evaluation(findings, evaluated);
        }

        List<WindowStats> windows = recentWindows(p, baseline, sorted, now);
        if (p.checkPowerShift()) {
            powerShift(p, baseline, windows, liveKinds.contains(AlertKind.POWER_SHIFT) ? LIVE_TOLERANCE_SCALE : 1.0, findings, evaluated);
        }
        if (p.checkDutyDrift() && baseline.switching()) {
            dutyDrift(p, baseline, windows, liveKinds.contains(AlertKind.DUTY_CYCLE_DRIFT) ? LIVE_TOLERANCE_SCALE : 1.0, findings, evaluated);
        }
        if (baseline.switching() && p.checkStuckOn()) {
            trailingRun(p, baseline, sorted, true, findings, evaluated);
        }
        if (baseline.switching() && p.checkStopped()) {
            trailingRun(p, baseline, sorted, false, findings, evaluated);
        }
        return new Evaluation(findings, evaluated);
    }

    // ---------------------------------------------------------------- windows

    /** Newest first: window 0 is [now - W, now). */
    private static List<WindowStats> recentWindows(DetectorProfile p, Baseline b, List<MinuteSample> sorted, Instant now) {
        List<WindowStats> out = new ArrayList<>();
        Duration w = Duration.ofMinutes(p.windowMinutes());
        for (int k = 0; k < p.lookbackWindows(); k++) {
            Instant end = now.minus(w.multipliedBy(k));
            out.add(WindowStats.compute(sorted, end.minus(w), end, b.onThresholdWatts()));
        }
        return out;
    }

    private static void powerShift(DetectorProfile p, Baseline b, List<WindowStats> windows, double tolScale,
                                   List<Finding> out, Set<AlertKind> evaluated) {
        Sustained s = sustained(p, windows, ws -> ws.onLevel(),
                v -> deviation(v, b.onLevelMedian(), b.onLevelSpread(), p.shiftWarnRel(), 0, p.sigmaK(), tolScale));
        if (s == null) {
            return;
        }
        evaluated.add(AlertKind.POWER_SHIFT);
        if (s.direction == 0) {
            return;
        }
        double rel = (s.value - b.onLevelMedian()) / b.onLevelMedian();
        Map<String, Object> ev = new LinkedHashMap<>();
        ev.put("baselineWatts", round1(b.onLevelMedian()));
        ev.put("currentWatts", round1(s.value));
        ev.put("changePct", round1(rel * 100));
        ev.put("windowHours", p.windowMinutes() / 60.0);
        ev.put("windowsDeviating", s.count);
        Severity sev = Math.abs(rel) >= p.shiftCritRel() ? Severity.CRITICAL : Severity.WARNING;
        out.add(new Finding(AlertKind.POWER_SHIFT, sev,
                String.format(Locale.ROOT, "Running power is %.0f%% %s than its learned normal (%.0f W vs %.0f W).",
                        Math.abs(rel * 100), rel > 0 ? "higher" : "lower", s.value, b.onLevelMedian()),
                ev));
    }

    private static void dutyDrift(DetectorProfile p, Baseline b, List<WindowStats> windows, double tolScale,
                                  List<Finding> out, Set<AlertKind> evaluated) {
        Sustained duty = sustained(p, windows, ws -> ws.duty(),
                v -> deviation(v, b.dutyMedian(), b.dutySpread(), p.dutyWarnRel(), DUTY_ABS_FLOOR, p.sigmaK(), tolScale));
        Sustained cycle = b.cycleMinutesMedian() > 0
                ? sustained(p, windows, ws -> ws.meanRunMinutes(),
                        v -> deviation(v, b.cycleMinutesMedian(), b.cycleMinutesSpread(), p.cycleLengthWarnRel(),
                                CYCLE_ABS_FLOOR_MIN, p.sigmaK(), tolScale))
                : null;
        if (duty == null && cycle == null) {
            return;
        }
        evaluated.add(AlertKind.DUTY_CYCLE_DRIFT);
        boolean dutyHit = duty != null && duty.direction != 0;
        boolean cycleHit = cycle != null && cycle.direction != 0;
        if (!dutyHit && !cycleHit) {
            return;
        }
        Map<String, Object> ev = new LinkedHashMap<>();
        StringBuilder msg = new StringBuilder();
        double worst = 0;
        if (dutyHit) {
            double rel = (duty.value - b.dutyMedian()) / Math.max(b.dutyMedian(), 1e-9);
            worst = Math.max(worst, Math.abs(rel));
            ev.put("baselineDutyPct", round1(b.dutyMedian() * 100));
            ev.put("currentDutyPct", round1(duty.value * 100));
            msg.append(String.format(Locale.ROOT, "Runs %.0f%% of the time vs %.0f%% normally. ",
                    duty.value * 100, b.dutyMedian() * 100));
        }
        if (cycleHit) {
            double rel = (cycle.value - b.cycleMinutesMedian()) / b.cycleMinutesMedian();
            worst = Math.max(worst, Math.abs(rel));
            ev.put("baselineCycleMinutes", round1(b.cycleMinutesMedian()));
            ev.put("currentCycleMinutes", round1(cycle.value));
            msg.append(String.format(Locale.ROOT, "Each run lasts %.0f min vs %.0f min normally.",
                    cycle.value, b.cycleMinutesMedian()));
        }
        ev.put("windowHours", p.windowMinutes() / 60.0);
        Severity sev = worst >= 2 * p.dutyWarnRel() ? Severity.CRITICAL : Severity.WARNING;
        out.add(new Finding(AlertKind.DUTY_CYCLE_DRIFT, sev, msg.toString().trim(), ev));
    }

    private static void trailingRun(DetectorProfile p, Baseline b, List<MinuteSample> sorted, boolean on,
                                    List<Finding> out, Set<AlertKind> evaluated) {
        AlertKind kind = on ? AlertKind.STUCK_ON : AlertKind.STOPPED;
        evaluated.add(kind);
        if (sorted.isEmpty()) {
            return;
        }
        List<Runs.Run> runs = Runs.scan(sorted, b.onThresholdWatts());
        Runs.Run last = runs.get(runs.size() - 1);
        if (last.on() != on) {
            return;
        }
        double learnedMax = on ? b.maxOnRunMinutes() : b.maxOffRunMinutes();
        int floor = on ? p.stuckOnFloorMinutes() : p.stoppedFloorMinutes();
        double limit = Math.min(DetectorProfile.MAX_RUN_LIMIT_MINUTES, Math.max(floor, RUN_LIMIT_FACTOR * learnedMax));
        double minutes = last.minutes();
        if (minutes < limit) {
            return;
        }
        Map<String, Object> ev = new LinkedHashMap<>();
        ev.put("runMinutes", round1(minutes));
        ev.put("limitMinutes", round1(limit));
        ev.put("longestNormalRunMinutes", round1(learnedMax));
        ev.put("since", last.first().toString());
        Severity sev = minutes >= 2 * limit ? Severity.CRITICAL : Severity.WARNING;
        String msg = on
                ? String.format(Locale.ROOT, "Has been running non-stop for %s; the longest normal run is %s.",
                        human((long) minutes), human((long) learnedMax))
                : String.format(Locale.ROOT, "Has not switched on for %s although it normally cycles (longest normal pause %s). "
                        + "It may be off, unplugged or dead.", human((long) minutes), human((long) learnedMax));
        out.add(new Finding(kind, sev, msg, ev));
    }

    // ---------------------------------------------------------------- sustained-deviation logic

    private record Sustained(int direction, double value, int count) {}

    @FunctionalInterface
    private interface Feature {
        double of(WindowStats ws);
    }

    @FunctionalInterface
    private interface Judge {
        int direction(double value);
    }

    /**
     * Null when there are too few valid windows to judge. Otherwise direction is +1/-1 when sustained, else 0.
     * "Sustained" = the newest valid window deviates and at least {@code sustainWindows} windows deviate the same way.
     */
    private static Sustained sustained(DetectorProfile p, List<WindowStats> windows, Feature f, Judge judge) {
        int valid = 0;
        int[] dirs = new int[windows.size()];
        double[] values = new double[windows.size()];
        boolean[] usable = new boolean[windows.size()];
        for (int i = 0; i < windows.size(); i++) {
            WindowStats ws = windows.get(i);
            double v = f.of(ws);
            if (ws.valid(p.minWindowCoverage()) && !Double.isNaN(v)) {
                usable[i] = true;
                values[i] = v;
                dirs[i] = judge.direction(v);
                valid++;
            }
        }
        if (valid < p.sustainWindows()) {
            return null;
        }
        int newest = -1;
        for (int i = 0; i < usable.length; i++) {
            if (usable[i]) {
                newest = i;
                break;
            }
        }
        int dir = dirs[newest];
        if (dir == 0) {
            return new Sustained(0, 0, 0);
        }
        List<Double> deviating = new ArrayList<>();
        for (int i = 0; i < usable.length; i++) {
            if (usable[i] && dirs[i] == dir) {
                deviating.add(values[i]);
            }
        }
        if (deviating.size() < p.sustainWindows()) {
            return new Sustained(0, 0, deviating.size());
        }
        return new Sustained(dir, RobustStats.median(deviating), deviating.size());
    }

    /** +1 / -1 when |value - median| exceeds the tolerance, else 0. */
    private static int deviation(double value, double median, double spread, double relTol, double absFloor,
                                 double sigmaK, double tolScale) {
        double s = Math.max(Double.isNaN(spread) ? 0 : spread, SPREAD_FLOOR_REL * Math.abs(median));
        double tol = tolScale * Math.max(Math.max(sigmaK * s, relTol * Math.abs(median)), absFloor);
        double d = value - median;
        return Math.abs(d) > tol ? (d > 0 ? 1 : -1) : 0;
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    private static String human(long minutes) {
        if (minutes >= 120) {
            return String.format(Locale.ROOT, "%.1f h", minutes / 60.0);
        }
        return minutes + " min";
    }
}
