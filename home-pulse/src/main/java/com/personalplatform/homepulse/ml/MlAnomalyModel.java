package com.personalplatform.homepulse.ml;

import com.personalplatform.homepulse.detect.AlertKind;
import com.personalplatform.homepulse.detect.AnomalyDetector;
import com.personalplatform.homepulse.detect.AnomalyModel;
import com.personalplatform.homepulse.detect.DecidedBy;
import com.personalplatform.homepulse.detect.DetectorProfile;
import com.personalplatform.homepulse.detect.Finding;
import com.personalplatform.homepulse.detect.MinuteSample;
import com.personalplatform.homepulse.detect.Severity;
import com.personalplatform.homepulse.ml.MlClient.Feature;
import com.personalplatform.homepulse.ml.MlClient.ScoreOutcome;
import com.personalplatform.homepulse.ml.MlClient.ScoreResponse;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Lets ml-service decide POWER_SHIFT and DUTY_CYCLE_DRIFT; everything else, and every case ml-service cannot answer,
 * stays with the built-in detector.
 *
 * <p>Per evaluation: the built-in detector always runs (it owns NO_DATA, STUCK_ON and STOPPED, and it is the fallback).
 * Then ml-service scores the newest hours. When the answer judged a kind, that kind's decision is ml-service's
 * (finding or no finding, {@link DecidedBy#ML}); when it did not (too little data in the window), or the call failed
 * (timeout, connection refused, 5xx, unreadable answer), or the appliance has no up-to-date model, the built-in
 * detector's decision stands ({@link DecidedBy#MAD}). An untrained or stale model is trained right away from the
 * baseline's learning window and scored again; a failed training is not retried for {@code retrainBackoff}.
 */
public class MlAnomalyModel implements AnomalyModel {

    private static final Logger LOG = LoggerFactory.getLogger(MlAnomalyModel.class);
    /** ml-service needs the 6-hour windows ending at the last 3 full hours: 9 hours (plus the running one). */
    static final Duration SCORE_LOOKBACK = Duration.ofHours(10);
    static final Set<AlertKind> ML_KINDS = EnumSet.of(AlertKind.POWER_SHIFT, AlertKind.DUTY_CYCLE_DRIFT);

    private final MlClient client;
    private final AnomalyModel fallback;
    private final Duration retrainBackoff;
    private final MeterRegistry meters;
    private final Map<UUID, Instant> lastTrainAttempt = new ConcurrentHashMap<>();
    private volatile boolean degraded;

    public MlAnomalyModel(MlClient client, AnomalyModel fallback, Duration retrainBackoff, MeterRegistry meters) {
        this.client = client;
        this.fallback = fallback;
        this.retrainBackoff = retrainBackoff;
        this.meters = meters;
    }

    @Override
    public AnomalyDetector.Evaluation evaluate(Input in) {
        AnomalyDetector.Evaluation mad = fallback.evaluate(in);
        Set<AlertKind> judgeable = judgeable(in);
        if (in.baseline() == null || judgeable.isEmpty()
                || mad.findings().stream().anyMatch(f -> f.kind() == AlertKind.NO_DATA)) {
            return mad;                                   // learning, nothing statistical to judge, or stale data
        }
        Optional<ScoreResponse> scored;
        try {
            scored = scoreOrTrain(in);
        } catch (MlClient.MlServiceException e) {
            count("error");
            if (!degraded) {
                LOG.warn("ml-service unavailable ({}); the built-in detector decides until it answers again", e.getMessage());
                degraded = true;
            }
            return mad;
        }
        if (degraded) {
            LOG.info("ml-service answers again");
            degraded = false;
        }
        if (scored.isEmpty()) {
            count("untrained");
            return mad;
        }
        return merge(in, mad, scored.get(), judgeable);
    }

    // ---------------------------------------------------------------- calls

    private Optional<ScoreResponse> scoreOrTrain(Input in) {
        Instant windowStart = in.baseline().learnedFrom();
        List<MinuteSample> recent = in.samples().stream()
                .filter(s -> !s.ts().isBefore(in.now().minus(SCORE_LOOKBACK)) && s.ts().isBefore(in.now()))
                .toList();
        Set<String> live = liveFeatures(in.liveKinds());
        ScoreOutcome outcome = client.score(in.applianceId(), windowStart, recent, in.now(), live);
        if (outcome instanceof ScoreOutcome.Scored s) {
            return Optional.of(s.response());
        }
        Instant last = lastTrainAttempt.get(in.applianceId());
        if (last != null && in.now().isBefore(last.plus(retrainBackoff))) {
            return Optional.empty();
        }
        lastTrainAttempt.put(in.applianceId(), in.now());
        LOG.info("appliance {}: training ml-service model ({}) on {} .. {}", in.applianceId(),
                outcome instanceof ScoreOutcome.Stale ? "stale" : "untrained", windowStart, in.baseline().learnedTo());
        client.train(in.applianceId(), in.type(), windowStart, in.baseline().learnedTo(), in.trainingSamples().get());
        count("trained");
        lastTrainAttempt.remove(in.applianceId());
        return client.score(in.applianceId(), windowStart, recent, in.now(), live) instanceof ScoreOutcome.Scored s
                ? Optional.of(s.response()) : Optional.empty();
    }

    // ---------------------------------------------------------------- decision

    private AnomalyDetector.Evaluation merge(Input in, AnomalyDetector.Evaluation mad, ScoreResponse r,
                                             Set<AlertKind> judgeable) {
        List<Finding> findings = new ArrayList<>();
        Set<AlertKind> evaluated = EnumSet.noneOf(AlertKind.class);
        evaluated.addAll(mad.evaluated());
        Set<AlertKind> decided = EnumSet.noneOf(AlertKind.class);
        for (AlertKind kind : judgeable) {
            List<Feature> features = r.features().stream()
                    .filter(f -> f.evaluated() && kind.name().equals(f.kind())).toList();
            if (features.isEmpty()) {
                continue;                                  // ml-service could not judge it: the built-in decision stands
            }
            decided.add(kind);
            evaluated.add(kind);
            List<Feature> hits = features.stream().filter(Feature::anomalous).toList();
            if (!hits.isEmpty()) {
                findings.add(kind == AlertKind.POWER_SHIFT
                        ? powerShift(in.profile(), hits.get(0), r.modelVersion())
                        : dutyDrift(in.profile(), hits, r.modelVersion()));
            }
        }
        mad.findings().stream().filter(f -> !decided.contains(f.kind())).forEach(findings::add);
        decided.forEach(k -> count("decided"));
        if (decided.size() < judgeable.size()) {
            count("not_evaluated");
        }
        return new AnomalyDetector.Evaluation(findings, evaluated);
    }

    /** Kinds ml-service may decide for this appliance: those the type's profile checks at all. */
    private static Set<AlertKind> judgeable(Input in) {
        Set<AlertKind> kinds = EnumSet.noneOf(AlertKind.class);
        if (in.profile().checkPowerShift()) {
            kinds.add(AlertKind.POWER_SHIFT);
        }
        if (in.profile().checkDutyDrift() && in.baseline() != null && in.baseline().switching()) {
            kinds.add(AlertKind.DUTY_CYCLE_DRIFT);
        }
        return kinds;
    }

    private static Set<String> liveFeatures(Set<AlertKind> liveKinds) {
        Set<String> out = new TreeSet<>();
        if (liveKinds.contains(AlertKind.POWER_SHIFT)) {
            out.add(MlClient.ON_POWER);
        }
        if (liveKinds.contains(AlertKind.DUTY_CYCLE_DRIFT)) {
            out.add(MlClient.DUTY);
            out.add(MlClient.CYCLE_MINUTES);
        }
        return out;
    }

    private static Finding powerShift(DetectorProfile p, Feature f, String modelVersion) {
        double expected = nz(f.expected());
        double observed = nz(f.observed());
        double rel = expected > 0 ? (observed - expected) / expected : 0;
        Map<String, Object> ev = common(f, modelVersion);
        ev.put("baselineWatts", round1(expected));
        ev.put("currentWatts", round1(observed));
        ev.put("changePct", round1(rel * 100));
        Severity sev = Math.abs(rel) >= p.shiftCritRel() ? Severity.CRITICAL : Severity.WARNING;
        String msg = String.format(Locale.ROOT,
                "Running power is %.0f%% %s than the learned normal for this time of day (%.0f W vs %.0f W).",
                Math.abs(rel * 100), rel > 0 ? "higher" : "lower", observed, expected);
        return new Finding(AlertKind.POWER_SHIFT, sev, msg, ev, DecidedBy.ML);
    }

    private static Finding dutyDrift(DetectorProfile p, List<Feature> hits, String modelVersion) {
        Map<String, Object> ev = common(hits.get(0), modelVersion);
        StringBuilder msg = new StringBuilder();
        double worst = 0;
        double score = 0;
        for (Feature f : hits) {
            double expected = nz(f.expected());
            double observed = nz(f.observed());
            worst = Math.max(worst, Math.abs(observed - expected) / Math.max(Math.abs(expected), 1e-9));
            score = Math.max(score, nz(f.score()));
            if (MlClient.DUTY.equals(f.name())) {
                ev.put("baselineDutyPct", round1(expected * 100));
                ev.put("currentDutyPct", round1(observed * 100));
                msg.append(String.format(Locale.ROOT, "Runs %.0f%% of the time vs %.0f%% normally at this time of day. ",
                        observed * 100, expected * 100));
            } else if (MlClient.CYCLE_MINUTES.equals(f.name())) {
                ev.put("baselineCycleMinutes", round1(expected));
                ev.put("currentCycleMinutes", round1(observed));
                msg.append(String.format(Locale.ROOT, "Each run lasts %.0f min vs %.0f min normally.", observed, expected));
            }
        }
        ev.put("mlScore", round2(score));
        ev.put("features", hits.stream().map(Feature::name).toList());
        Severity sev = worst >= 2 * p.dutyWarnRel() ? Severity.CRITICAL : Severity.WARNING;
        return new Finding(AlertKind.DUTY_CYCLE_DRIFT, sev, msg.toString().trim(), ev, DecidedBy.ML);
    }

    private static Map<String, Object> common(Feature f, String modelVersion) {
        Map<String, Object> ev = new LinkedHashMap<>();
        ev.put("model", modelVersion == null ? "ml-service" : modelVersion);
        ev.put("mlScore", round2(nz(f.score())));
        ev.put("zScore", round2(nz(f.statistic())));
        ev.put("zThreshold", round2(nz(f.threshold())));
        ev.put("windowHours", 6.0);
        ev.put("hoursSustained", 3);
        return ev;
    }

    private void count(String outcome) {
        if (meters != null) {
            meters.counter("homepulse.ml.evaluations", "outcome", outcome).increment();
        }
    }

    private static double nz(Double v) {
        return v == null || v.isNaN() ? 0 : v;
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
