package com.personalplatform.homepulse.detect;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.homepulse.sim.ApplianceSimulator;
import com.personalplatform.homepulse.sim.ApplianceSimulator.Degradation;
import com.personalplatform.homepulse.sim.EvaluationReplay;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * Detector behaviour on synthetic-but-realistic data. Everything is deterministic (seeded generators, injected
 * "now"), so a failure is a real regression, never flakiness.
 */
class AnomalyDetectorTest {

    static final Instant START = Instant.parse("2026-03-01T00:00:00Z");
    static final int LEARN_DAYS = 7;
    static final Instant LEARNED_TO = START.plus(LEARN_DAYS, ChronoUnit.DAYS);
    static final Duration HOURLY = Duration.ofHours(1);

    static Baseline learn(List<MinuteSample> samples, DetectorProfile p) {
        Optional<Baseline> b = BaselineLearner.learn(samples, p, START, LEARNED_TO);
        assertThat(b).as("baseline learned").isPresent();
        return b.get();
    }

    static Instant day(int d) {
        return START.plus(d, ChronoUnit.DAYS);
    }

    // ------------------------------------------------------------------ baseline

    @Test
    void learnsFridgeSignature() {
        var p = DetectorProfile.forType(ApplianceType.FRIDGE);
        Baseline b = learn(ApplianceSimulator.fridge(START, 14, 1, Degradation.NONE), p);
        assertThat(b.switching()).isTrue();
        assertThat(b.onLevelMedian()).isBetween(110.0, 120.0);
        assertThat(b.standbyWatts()).isBetween(2.0, 3.5);
        assertThat(b.dutyMedian()).isBetween(0.25, 0.45);
        assertThat(b.cycleMinutesMedian()).isBetween(18.0, 32.0);
        assertThat(b.onThresholdWatts()).isBetween(40.0, 80.0);
        assertThat(b.maxOnRunMinutes()).isLessThan(60);
        assertThat(b.maxOffRunMinutes()).isLessThan(120);
        assertThat(b.windowsUsed()).isGreaterThanOrEqualTo(26);
    }

    @Test
    void refusesToLearnFromTooLittleData() {
        var p = DetectorProfile.forType(ApplianceType.FRIDGE);
        var oneDay = ApplianceSimulator.fridge(START, 1, 1, Degradation.NONE);
        assertThat(BaselineLearner.learn(oneDay, p, START, day(1))).isEmpty();
        assertThat(BaselineLearner.learn(List.of(), p, START, day(7))).isEmpty();
    }

    @Test
    void baselineIsRobustToGlitchesDuringLearning() {
        var p = DetectorProfile.forType(ApplianceType.FRIDGE);
        var clean = ApplianceSimulator.fridge(START, 7, 3, Degradation.NONE);
        // inject sensor spikes (a 2 kW glitch for 30 minutes on day 3) into the learning data
        var glitched = ApplianceSimulator.stuckOn(clean, day(3), day(3).plus(30, ChronoUnit.MINUTES), 2000, 9);
        Baseline a = learn(clean, p);
        Baseline b = learn(glitched, p);
        assertThat(b.onLevelMedian()).isCloseTo(a.onLevelMedian(), org.assertj.core.data.Percentage.withPercentage(2));
        assertThat(b.dutyMedian()).isCloseTo(a.dutyMedian(), org.assertj.core.data.Offset.offset(0.02));
    }

    // ------------------------------------------------------------------ false positives

    @Test
    void healthyFridgeRaisesNoAlertsOverSixtyDays() {
        var p = DetectorProfile.forType(ApplianceType.FRIDGE);
        for (long seed : new long[] {11, 12, 13}) {
            var samples = ApplianceSimulator.fridge(START, 67, seed, Degradation.NONE);
            Baseline b = learn(samples, p);
            // a 45 minute power cut (no data) is part of normal life and must not alert either
            samples = ApplianceSimulator.silence(samples, day(30), day(30).plus(45, ChronoUnit.MINUTES));
            var replay = new EvaluationReplay(p, b, samples, START, 3);
            replay.run(LEARNED_TO.plus(2, ChronoUnit.DAYS), day(67), HOURLY);
            assertThat(replay.all).as("seed %d: alerts on a healthy fridge", seed).isEmpty();
        }
    }

    @Test
    void healthyAirConditionerRaisesNoAlertsOverSixtyDays() {
        var p = DetectorProfile.forType(ApplianceType.AIR_CONDITIONER);
        for (long seed : new long[] {21, 22, 23}) {
            var samples = ApplianceSimulator.airConditioner(START, 67, seed, Degradation.NONE);
            Baseline b = learn(samples, p);
            var replay = new EvaluationReplay(p, b, samples, START, 3);
            replay.run(LEARNED_TO.plus(2, ChronoUnit.DAYS), day(67), HOURLY);
            assertThat(replay.all).as("seed %d: alerts on a healthy AC", seed).isEmpty();
        }
    }

    // ------------------------------------------------------------------ degradation (the point of the product)

    /** Failure threshold of the story: compressor drawing 18% more than normal. */
    static final double FAILURE_EXCESS = 0.18;

    @Test
    void degradingCompressorIsCaughtWellBeforeTheFailureThreshold() {
        var p = DetectorProfile.forType(ApplianceType.AIR_CONDITIONER);
        Instant onset = day(14);
        double perDay = 0.006;   // +0.6 % every day: reaches the 18 % failure threshold 30 days after onset
        var degradation = Degradation.ramp(onset, perDay);
        var samples = ApplianceSimulator.airConditioner(START, 70, 31, degradation);
        Baseline b = learn(samples, p);

        var replay = new EvaluationReplay(p, b, samples, START, 3);
        replay.run(LEARNED_TO.plus(2, ChronoUnit.DAYS), day(70), HOURLY);

        var shift = replay.all.stream().filter(a -> a.kind() == AlertKind.POWER_SHIFT).findFirst();
        assertThat(shift).as("a POWER_SHIFT alert was raised").isPresent();
        double excessWhenAlerted = degradation.applyAsDouble(shift.get().openedAt);
        Instant thresholdReachedAt = onset.plus((long) (FAILURE_EXCESS / perDay * 1440), ChronoUnit.MINUTES);
        long daysOfWarning = Duration.between(shift.get().openedAt, thresholdReachedAt).toDays();

        assertThat(excessWhenAlerted).as("true excess when first alerted").isLessThan(0.14).isGreaterThan(0.04);
        assertThat(daysOfWarning).as("days of warning before 18% excess").isGreaterThanOrEqualTo(7);
        assertThat(shift.get().opened.evidence()).containsKeys("baselineWatts", "currentWatts", "changePct");
        // and it never alerts before the degradation even starts
        assertThat(shift.get().openedAt).isAfter(onset);
        // hysteresis: hovering around the threshold must not open/resolve/re-open alerts
        assertThat(replay.all.stream().filter(a -> a.kind() == AlertKind.POWER_SHIFT)).hasSize(1);
        assertThat(replay.live()).extracting(EvaluationReplay.Alert::kind).contains(AlertKind.POWER_SHIFT);
        assertThat(replay.all.stream().filter(a -> a.openedAt.isBefore(onset))).isEmpty();
    }

    @Test
    void degradingFridgeCompressorIsCaughtBeforeFailure() {
        var p = DetectorProfile.forType(ApplianceType.FRIDGE);
        Instant onset = day(12);
        double perDay = 0.005;   // 18 % after 36 days
        var degradation = Degradation.ramp(onset, perDay);
        var samples = ApplianceSimulator.fridge(START, 60, 41, degradation);
        Baseline b = learn(samples, p);

        var replay = new EvaluationReplay(p, b, samples, START, 3);
        replay.run(LEARNED_TO.plus(2, ChronoUnit.DAYS), day(60), HOURLY);

        Instant thresholdReachedAt = onset.plus((long) (FAILURE_EXCESS / perDay * 1440), ChronoUnit.MINUTES);
        assertThat(replay.all).extracting(EvaluationReplay.Alert::kind).contains(AlertKind.POWER_SHIFT);
        for (var a : replay.all) {
            assertThat(a.openedAt).as("%s opened before failure threshold", a.kind()).isBefore(thresholdReachedAt);
            assertThat(a.openedAt).isAfter(onset);
        }
    }

    @Test
    void refrigerantLeakShowsUpAsLongerRunsEvenThoughPowerIsUnchanged() {
        var p = DetectorProfile.forType(ApplianceType.FRIDGE);
        Instant onset = day(12);
        var runs = Degradation.ramp(onset, 0.02);   // ON runs 2 % longer every day
        var samples = ApplianceSimulator.fridge(START, 60, 43, Degradation.NONE, runs);
        Baseline b = learn(samples, p);

        var replay = new EvaluationReplay(p, b, samples, START, 3);
        replay.run(LEARNED_TO.plus(2, ChronoUnit.DAYS), day(60), HOURLY);

        var drift = replay.all.stream().filter(a -> a.kind() == AlertKind.DUTY_CYCLE_DRIFT).findFirst();
        assertThat(drift).isPresent();
        assertThat(drift.get().openedAt).isAfter(onset);
        assertThat(runs.applyAsDouble(drift.get().openedAt)).as("run length excess when first alerted").isLessThan(0.6);
        assertThat(drift.get().opened.evidence()).containsKeys("baselineCycleMinutes", "currentCycleMinutes");
        assertThat(replay.all).extracting(EvaluationReplay.Alert::kind).doesNotContain(AlertKind.POWER_SHIFT);
    }

    // ------------------------------------------------------------------ stuck on / dead / no data

    @Test
    void stuckOnIsReportedOnlyAfterTheLimitAndClearsWhenFixed() {
        var p = DetectorProfile.forType(ApplianceType.FRIDGE);
        var healthy = ApplianceSimulator.fridge(START, 14, 51, Degradation.NONE);
        Baseline b = learn(healthy, p);
        Instant from = day(10).plus(2, ChronoUnit.HOURS);
        Instant to = from.plus(8, ChronoUnit.HOURS);
        var samples = ApplianceSimulator.stuckOn(healthy, from, to, 118, 5);

        // just before the 180 minute floor: nothing
        var early = AnomalyDetector.evaluate(p, b, recent(samples, from.plus(170, ChronoUnit.MINUTES)), START, from.plus(170, ChronoUnit.MINUTES));
        assertThat(early.findings()).extracting(Finding::kind).doesNotContain(AlertKind.STUCK_ON);

        // past the floor: STUCK_ON
        Instant at = from.plus(200, ChronoUnit.MINUTES);
        var late = AnomalyDetector.evaluate(p, b, recent(samples, at), START, at);
        assertThat(late.findings()).extracting(Finding::kind).contains(AlertKind.STUCK_ON);
        Finding f = late.findings().stream().filter(x -> x.kind() == AlertKind.STUCK_ON).findFirst().orElseThrow();
        assertThat(f.severity()).isEqualTo(Severity.WARNING);
        assertThat(((Number) f.evidence().get("runMinutes")).doubleValue()).isGreaterThan(180);

        // long after twice the limit: CRITICAL
        Instant much = from.plus(7, ChronoUnit.HOURS);
        var crit = AnomalyDetector.evaluate(p, b, recent(samples, much), START, much);
        assertThat(crit.findings()).anySatisfy(x -> {
            assertThat(x.kind()).isEqualTo(AlertKind.STUCK_ON);
            assertThat(x.severity()).isEqualTo(Severity.CRITICAL);
        });

        // fixed (normal cycling resumes): a normal evaluation a day later is clean
        var clean = AnomalyDetector.evaluate(p, b, recent(samples, day(12)), START, day(12));
        assertThat(clean.findings()).isEmpty();
    }

    @Test
    void deadApplianceWhileSensorKeepsReportingIsReportedAsStopped() {
        var p = DetectorProfile.forType(ApplianceType.FRIDGE);
        var healthy = ApplianceSimulator.fridge(START, 14, 61, Degradation.NONE);
        Baseline b = learn(healthy, p);
        Instant from = day(10);
        var samples = ApplianceSimulator.dead(healthy, from, day(12));

        Instant soon = from.plus(4, ChronoUnit.HOURS);
        assertThat(AnomalyDetector.evaluate(p, b, recent(samples, soon), START, soon).findings())
                .extracting(Finding::kind).doesNotContain(AlertKind.STOPPED);

        Instant later = from.plus(8, ChronoUnit.HOURS);
        var ev = AnomalyDetector.evaluate(p, b, recent(samples, later), START, later);
        assertThat(ev.findings()).extracting(Finding::kind).contains(AlertKind.STOPPED);
        assertThat(ev.findings()).extracting(Finding::kind).doesNotContain(AlertKind.NO_DATA);
    }

    @Test
    void silentSensorRaisesNoDataOnlyAfterTheGraceTime() {
        var p = DetectorProfile.forType(ApplianceType.FRIDGE);
        var healthy = ApplianceSimulator.fridge(START, 14, 71, Degradation.NONE);
        Baseline b = learn(healthy, p);
        Instant dies = day(10);
        var samples = ApplianceSimulator.upTo(healthy, dies);

        Instant at30 = dies.plus(30, ChronoUnit.MINUTES);
        assertThat(AnomalyDetector.evaluate(p, b, recent(samples, at30), START, at30).findings()).isEmpty();

        Instant at90 = dies.plus(90, ChronoUnit.MINUTES);
        var ev = AnomalyDetector.evaluate(p, b, recent(samples, at90), START, at90);
        assertThat(ev.findings()).hasSize(1);
        assertThat(ev.findings().get(0).kind()).isEqualTo(AlertKind.NO_DATA);
        assertThat(ev.findings().get(0).severity()).isEqualTo(Severity.WARNING);
        // while there is no data nothing else can be judged, so other kinds must not be auto-resolved
        assertThat(ev.evaluated()).containsExactly(AlertKind.NO_DATA);

        Instant atDay2 = dies.plus(26, ChronoUnit.HOURS);
        assertThat(AnomalyDetector.evaluate(p, b, recent(samples, atDay2), START, atDay2).findings().get(0).severity())
                .isEqualTo(Severity.CRITICAL);
    }

    @Test
    void deviceThatNeverReportedIsFlaggedAfterGraceTime() {
        var p = DetectorProfile.forType(ApplianceType.FRIDGE);
        Instant registered = day(1);
        assertThat(AnomalyDetector.evaluate(p, null, List.of(), registered, registered.plus(20, ChronoUnit.MINUTES)).findings())
                .isEmpty();
        var ev = AnomalyDetector.evaluate(p, null, List.of(), registered, registered.plus(3, ChronoUnit.HOURS));
        assertThat(ev.findings()).extracting(Finding::kind).containsExactly(AlertKind.NO_DATA);
    }

    @Test
    void whileLearningOnlyNoDataIsJudged() {
        var p = DetectorProfile.forType(ApplianceType.FRIDGE);
        var samples = ApplianceSimulator.fridge(START, 2, 81, Degradation.NONE);
        Instant now = day(2);
        var ev = AnomalyDetector.evaluate(p, null, recent(samples, now), START, now);
        assertThat(ev.findings()).isEmpty();
        assertThat(ev.evaluated()).containsExactly(AlertKind.NO_DATA);
    }

    @Test
    void dataGapInsideTheWindowsDoesNotCreateFalseSignals() {
        var p = DetectorProfile.forType(ApplianceType.FRIDGE);
        var samples = ApplianceSimulator.fridge(START, 20, 91, Degradation.NONE);
        Baseline b = learn(samples, p);
        // 5 hours of missing data inside the lookback: windows with too little coverage are skipped, not misjudged
        samples = ApplianceSimulator.silence(samples, day(15), day(15).plus(5, ChronoUnit.HOURS));
        var replay = new EvaluationReplay(p, b, samples, START, 3);
        replay.run(day(15).plus(5, ChronoUnit.HOURS).plus(30, ChronoUnit.MINUTES), day(18), HOURLY);
        assertThat(replay.all).extracting(a -> a.kind()).doesNotContain(AlertKind.POWER_SHIFT, AlertKind.DUTY_CYCLE_DRIFT,
                AlertKind.STUCK_ON, AlertKind.STOPPED);
    }

    static List<MinuteSample> recent(List<MinuteSample> all, Instant now) {
        Instant from = now.minus(DetectorProfile.FETCH_LOOKBACK_MINUTES, ChronoUnit.MINUTES);
        return all.stream().filter(s -> !s.ts().isBefore(from) && s.ts().isBefore(now)).toList();
    }
}
