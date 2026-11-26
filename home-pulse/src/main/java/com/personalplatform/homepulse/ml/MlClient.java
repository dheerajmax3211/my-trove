package com.personalplatform.homepulse.ml;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.personalplatform.homepulse.detect.ApplianceType;
import com.personalplatform.homepulse.detect.MinuteSample;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** ml-service as home-pulse sees it. Any transport or server failure is an {@link MlServiceException}. */
public interface MlClient {

    /** Feature names of ml-service (see ml-service/app/model.py). */
    String ON_POWER = "on_power";
    String DUTY = "duty";
    String CYCLE_MINUTES = "cycle_minutes";

    /** The answer to a score request. */
    sealed interface ScoreOutcome {
        record Scored(ScoreResponse response) implements ScoreOutcome {}

        /** No model for this appliance (never trained, or ml-service restarted without its volume). */
        record Untrained() implements ScoreOutcome {}

        /** The model was trained on another learning window (the baseline was re-learned since). */
        record Stale() implements ScoreOutcome {}
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ScoreResponse(
            String status,
            boolean evaluated,
            boolean anomalous,
            @JsonProperty("model_version") String modelVersion,
            List<Feature> features) {

        public ScoreResponse {
            features = features == null ? List.of() : List.copyOf(features);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Feature(
            String name,
            String kind,
            boolean evaluated,
            boolean anomalous,
            Double statistic,
            Double threshold,
            Double score,
            int direction,
            Double observed,
            Double expected,
            @JsonProperty("change_pct") Double changePct) {}

    /**
     * @param windowStart  start of the learning window the caller expects the model to be trained on
     * @param liveFeatures features with a live alert (ml-service lowers their threshold: hysteresis)
     */
    ScoreOutcome score(UUID applianceId, Instant windowStart, List<MinuteSample> samples, Instant now,
                       Set<String> liveFeatures);

    /** Trains (replaces) the appliance's model on the minute samples of [windowStart, windowEnd). */
    void train(UUID applianceId, ApplianceType type, Instant windowStart, Instant windowEnd, List<MinuteSample> samples);

    class MlServiceException extends RuntimeException {
        public MlServiceException(String message) {
            super(message);
        }

        public MlServiceException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
