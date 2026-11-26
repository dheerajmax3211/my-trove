package com.personalplatform.homepulse.detect;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * The seam between the evaluation job and the model that judges an appliance. Two implementations: {@link MadAnomalyModel}
 * (the built-in detector, always available) and the ml-service client, which falls back to the built-in detector on
 * any failure. Each finding says which model decided it ({@link Finding#decidedBy()}).
 */
public interface AnomalyModel {

    /**
     * Everything one evaluation needs.
     *
     * @param baseline         learned signature, or null while still learning
     * @param samples          recent 1-minute samples (up to {@link DetectorProfile#FETCH_LOOKBACK_MINUTES})
     * @param lastSeen         newest known reading time (or the registration time)
     * @param liveKinds        kinds that currently have a live alert (hysteresis)
     * @param trainingSamples  the minute samples of the baseline's learning period, fetched only when a model must be
     *                         (re)trained
     */
    record Input(UUID applianceId, ApplianceType type, DetectorProfile profile, Baseline baseline,
                 List<MinuteSample> samples, Instant lastSeen, Instant now, Set<AlertKind> liveKinds,
                 Supplier<List<MinuteSample>> trainingSamples) {}

    AnomalyDetector.Evaluation evaluate(Input input);
}
