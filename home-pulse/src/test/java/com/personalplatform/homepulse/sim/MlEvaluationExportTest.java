package com.personalplatform.homepulse.sim;

import com.personalplatform.homepulse.detect.AlertKind;
import com.personalplatform.homepulse.detect.ApplianceType;
import com.personalplatform.homepulse.detect.Baseline;
import com.personalplatform.homepulse.detect.BaselineLearner;
import com.personalplatform.homepulse.detect.DetectorProfile;
import com.personalplatform.homepulse.detect.MinuteSample;
import com.personalplatform.homepulse.sim.ApplianceSimulator.Degradation;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.zip.GZIPOutputStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

/**
 * Not a regular test: the first half of ml-service's evaluation (ml-service/eval/run.sh). Generates labelled episodes
 * with the canonical simulator, replays the built-in (MAD) detector over each exactly as the job does (hourly here)
 * and writes samples + MAD's alert openings as gzipped JSON. ml-service/eval/evaluate.py then trains and replays the
 * ML model on the same samples. Runs only with {@code -Dml.eval.out=<dir>}.
 */
@EnabledIfSystemProperty(named = "ml.eval.out", matches = ".+")
class MlEvaluationExportTest {

    static final Instant START = Instant.parse("2031-03-01T00:00:00Z");
    static final int LEARN_DAYS = 7;
    static final int ONSET_DAY = 9;
    static final int TOTAL_DAYS = 23;
    static final long[] TUNING_SEEDS = {101, 102, 103};
    static final long[] EVAL_SEEDS = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};

    /** fault: none | power_ramp | power_step | run_ramp; size: per day (ramp) or step size. */
    record Scenario(String name, ApplianceType type, String fault, double size) {}

    static final List<Scenario> SCENARIOS = List.of(
            new Scenario("fridge_healthy", ApplianceType.FRIDGE, "none", 0),
            new Scenario("fridge_power_ramp_1pct", ApplianceType.FRIDGE, "power_ramp", 0.01),
            new Scenario("fridge_power_step_12pct", ApplianceType.FRIDGE, "power_step", 0.12),
            new Scenario("fridge_power_step_7pct", ApplianceType.FRIDGE, "power_step", 0.07),
            new Scenario("fridge_refrigerant_leak", ApplianceType.FRIDGE, "run_ramp", 0.03),
            new Scenario("ac_healthy", ApplianceType.AIR_CONDITIONER, "none", 0),
            new Scenario("ac_power_ramp_1pct", ApplianceType.AIR_CONDITIONER, "power_ramp", 0.01),
            new Scenario("ac_power_step_12pct", ApplianceType.AIR_CONDITIONER, "power_step", 0.12),
            new Scenario("ac_power_step_7pct", ApplianceType.AIR_CONDITIONER, "power_step", 0.07));

    @Test
    void export() throws IOException {
        Path out = Path.of(System.getProperty("ml.eval.out"));
        Files.createDirectories(out);
        for (Scenario sc : SCENARIOS) {
            for (long seed : TUNING_SEEDS) {
                write(out, sc, seed, "tuning");
            }
            for (long seed : EVAL_SEEDS) {
                write(out, sc, seed, "evaluation");
            }
        }
    }

    private static void write(Path dir, Scenario sc, long seed, String split) throws IOException {
        Instant onset = START.plus(ONSET_DAY, ChronoUnit.DAYS);
        Instant learnedTo = START.plus(LEARN_DAYS, ChronoUnit.DAYS);
        Instant end = START.plus(TOTAL_DAYS, ChronoUnit.DAYS);
        Degradation power = switch (sc.fault()) {
            case "power_ramp" -> Degradation.ramp(onset, sc.size());
            case "power_step" -> t -> t.isBefore(onset) ? 0.0 : sc.size();
            default -> Degradation.NONE;
        };
        Degradation runs = "run_ramp".equals(sc.fault()) ? Degradation.ramp(onset, sc.size()) : Degradation.NONE;
        List<MinuteSample> samples = sc.type() == ApplianceType.FRIDGE
                ? ApplianceSimulator.fridge(START, TOTAL_DAYS, seed, power, runs)
                : ApplianceSimulator.airConditioner(START, TOTAL_DAYS, seed, power);

        DetectorProfile profile = DetectorProfile.forType(sc.type());
        Baseline baseline = BaselineLearner.learn(ApplianceSimulator.upTo(samples, learnedTo), profile, START, learnedTo)
                .orElseThrow();
        EvaluationReplay replay = new EvaluationReplay(profile, baseline, samples, START, 3);
        replay.run(learnedTo.plus(Duration.ofHours(1)), end, Duration.ofHours(1));

        StringBuilder alerts = new StringBuilder();
        for (EvaluationReplay.Alert a : replay.all) {
            if (a.kind() != AlertKind.POWER_SHIFT && a.kind() != AlertKind.DUTY_CYCLE_DRIFT) {
                continue;          // the run-length and silence rules are identical in both paths
            }
            alerts.append(alerts.isEmpty() ? "" : ",").append(String.format(Locale.ROOT, "{\"kind\":\"%s\",\"opened\":%d}",
                    a.kind(), a.openedAt.getEpochSecond()));
        }
        Path file = dir.resolve(String.format(Locale.ROOT, "%s_%s_seed%d.json.gz", split, sc.name(), seed));
        try (OutputStream os = new GZIPOutputStream(Files.newOutputStream(file));
             Writer w = new OutputStreamWriter(os, StandardCharsets.UTF_8)) {
            w.write(String.format(Locale.ROOT,
                    "{\"scenario\":\"%s\",\"split\":\"%s\",\"seed\":%d,\"type\":\"%s\",\"fault\":\"%s\",\"size\":%s,"
                            + "\"start\":%d,\"learned_to\":%d,\"onset\":%s,\"end\":%d,\"mad_alerts\":[%s],\"samples\":[",
                    sc.name(), split, seed, sc.type(), sc.fault(), sc.size(), START.getEpochSecond(),
                    learnedTo.getEpochSecond(), "none".equals(sc.fault()) ? "null" : String.valueOf(onset.getEpochSecond()),
                    end.getEpochSecond(), alerts));
            for (int i = 0; i < samples.size(); i++) {
                MinuteSample s = samples.get(i);
                w.write(String.format(Locale.ROOT, "%s[%d,%.2f]", i == 0 ? "" : ",", s.ts().getEpochSecond(), s.watts()));
            }
            w.write("]}");
        }
    }
}
