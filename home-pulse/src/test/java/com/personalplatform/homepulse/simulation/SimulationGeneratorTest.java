package com.personalplatform.homepulse.simulation;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.homepulse.detect.AlertKind;
import com.personalplatform.homepulse.detect.AnomalyDetector;
import com.personalplatform.homepulse.detect.ApplianceType;
import com.personalplatform.homepulse.detect.BaselineLearner;
import com.personalplatform.homepulse.detect.DetectorProfile;
import com.personalplatform.homepulse.detect.MinuteSample;
import com.personalplatform.homepulse.ingest.ReadingInput;
import com.personalplatform.homepulse.reading.SampleGapFill;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class SimulationGeneratorTest {

    private static final Instant NOW = Instant.parse("2031-01-15T12:00:00Z");

    private static List<MinuteSample> minutes(List<ReadingInput> readings) {
        var raw = readings.stream().map(r -> new MinuteSample(r.ts(), r.watts())).toList();
        return SampleGapFill.fill(raw, NOW);
    }

    @ParameterizedTest
    @EnumSource(ApplianceType.class)
    void sevenDaysAtFiveMinutesIsTwoThousandAndSeventeenReadings(ApplianceType type) {
        var readings = SimulationGenerator.generate(type, 42, SimulationScenario.NORMAL, NOW, 7);
        assertThat(readings).hasSize(7 * 288 + 1);
        assertThat(readings.get(0).ts()).isEqualTo(NOW.minus(Duration.ofDays(7)));
        assertThat(readings.get(readings.size() - 1).ts()).isEqualTo(NOW);
        assertThat(readings).allSatisfy(r -> assertThat(r.watts()).isGreaterThanOrEqualTo(0));
    }

    @Test
    void readingsAreAFunctionOfSeedAndTimeOnly() {
        var a = SimulationGenerator.generate(ApplianceType.FRIDGE, 7, SimulationScenario.NORMAL, NOW, 3);
        var b = SimulationGenerator.generate(ApplianceType.FRIDGE, 7, SimulationScenario.NORMAL, NOW.plusSeconds(1), 3);
        assertThat(b.subList(0, b.size())).containsAll(a.subList(0, a.size()));   // same slots, same values
        var other = SimulationGenerator.generate(ApplianceType.FRIDGE, 8, SimulationScenario.NORMAL, NOW, 3);
        assertThat(other).isNotEqualTo(a);
    }

    @Test
    void fridgeLooksLikeAFridge() {
        var w = SimulationGenerator.generate(ApplianceType.FRIDGE, 1, SimulationScenario.NORMAL, NOW, 7)
                .stream().mapToDouble(ReadingInput::watts).toArray();
        long on = java.util.Arrays.stream(w).filter(x -> x > 100).count();
        assertThat((double) on / w.length).isBetween(0.25, 0.5);
        assertThat(java.util.Arrays.stream(w).filter(x -> x <= 100).max().orElseThrow()).isLessThan(10);
        assertThat(java.util.Arrays.stream(w).max().orElseThrow()).isBetween(135.0, 140.0);
    }

    /** The detector, fed exactly what the evaluation job feeds it, must learn a baseline and stay quiet. */
    @ParameterizedTest
    @EnumSource(ApplianceType.class)
    void healthyHistoryLearnsABaselineAndRaisesNothingAcrossManySeeds(ApplianceType type) {
        DetectorProfile profile = DetectorProfile.forType(type);
        for (long seed = 1; seed <= 60; seed++) {
            var samples = minutes(SimulationGenerator.generate(type, seed * 7919, SimulationScenario.NORMAL, NOW, 7));
            Instant from = NOW.minus(Duration.ofDays(7));
            var baseline = BaselineLearner.learn(samples, profile, from, NOW);
            assertThat(baseline).as("%s seed %d learns", type, seed).isPresent();
            var recent = samples.stream().filter(s -> !s.ts().isBefore(NOW.minus(Duration.ofHours(48)))).toList();
            var evaluation = AnomalyDetector.evaluate(profile, baseline.get(), recent, NOW, NOW);
            assertThat(evaluation.findings()).as("%s seed %d findings", type, seed).isEmpty();
        }
    }

    @ParameterizedTest
    @EnumSource(ApplianceType.class)
    void anomalyScenarioIsDetectedAcrossManySeeds(ApplianceType type) {
        DetectorProfile profile = DetectorProfile.forType(type);
        for (long seed = 1; seed <= 60; seed++) {
            var samples = minutes(SimulationGenerator.generate(type, seed * 104729, SimulationScenario.ANOMALY, NOW, 7));
            // the service learns from the healthy part of the history only
            Instant healthyEnd = NOW.minus(Duration.ofHours(SimulationGenerator.anomalyHours(type)));
            var baseline = BaselineLearner.learn(samples, profile, NOW.minus(Duration.ofDays(7)), healthyEnd);
            assertThat(baseline).as("%s seed %d learns", type, seed).isPresent();
            var recent = samples.stream().filter(s -> !s.ts().isBefore(NOW.minus(Duration.ofHours(48)))).toList();
            var findings = AnomalyDetector.evaluate(profile, baseline.get(), recent, NOW, NOW).findings();
            assertThat(findings).as("%s seed %d findings", type, seed).isNotEmpty();
            assertThat(findings).extracting(f -> f.kind()).doesNotContain(AlertKind.NO_DATA);
        }
    }

    // --------------------------------------------------------------- gap fill

    @Test
    void gapFillBridgesAFiveMinuteCadenceButNotARealOutage() {
        Instant t = NOW;
        var samples = List.of(
                new MinuteSample(t, 10), new MinuteSample(t.plusSeconds(300), 20),     // 5-minute cadence: filled
                new MinuteSample(t.plusSeconds(3600), 30));                            // 55-minute outage after the 2nd
        var out = SampleGapFill.fill(samples, t.plusSeconds(3600 + 600));
        assertThat(out).extracting(MinuteSample::watts).containsExactly(
                10.0, 10.0, 10.0, 10.0, 10.0,          // minutes 0..4
                20.0, 20.0, 20.0, 20.0, 20.0,          // minutes 5..9, then silence
                30.0, 30.0, 30.0, 30.0, 30.0);         // 60..64, nothing at or after `to` (70)
        assertThat(out.get(out.size() - 1).ts()).isEqualTo(t.plusSeconds(3600 + 240));
    }

    @Test
    void gapFillNeverCrossesTheEndOfTheRange() {
        var out = SampleGapFill.fill(List.of(new MinuteSample(NOW, 5)), NOW.plusSeconds(120));
        assertThat(out).extracting(MinuteSample::ts).containsExactly(NOW, NOW.plusSeconds(60));
    }
}
