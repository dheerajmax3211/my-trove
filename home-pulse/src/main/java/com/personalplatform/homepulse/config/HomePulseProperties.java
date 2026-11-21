package com.personalplatform.homepulse.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** All tunables under the {@code app.*} prefix (the Firebase settings are bound separately by platform-security). */
@ConfigurationProperties(prefix = "app")
public record HomePulseProperties(
        @DefaultValue Mqtt mqtt,
        @DefaultValue Evaluation evaluation,
        @DefaultValue Ingest ingest) {

    /** MQTT subscriber adapter. Off by default: no broker is needed to run the service. */
    public record Mqtt(
            @DefaultValue("false") boolean enabled,
            @DefaultValue("tcp://localhost:1883") String brokerUri,
            @DefaultValue("home-pulse") String clientId,
            String username,
            String password,
            @DefaultValue("homepulse/+/reading") String topicFilter,
            @DefaultValue("1") int qos) {}

    /**
     * @param enabled              run the scheduled anomaly evaluation
     * @param interval             delay between evaluation runs
     * @param learnDays            length of the learning period that defines "normal"
     * @param resolveAfterClearRuns consecutive clean evaluations before an alert auto-resolves
     */
    public record Evaluation(
            @DefaultValue("true") boolean enabled,
            @DefaultValue("PT5M") Duration interval,
            @DefaultValue("7") int learnDays,
            @DefaultValue("3") int resolveAfterClearRuns) {}

    /**
     * @param maxBatchSize  readings accepted per request
     * @param maxFutureSkew readings stamped further in the future than this are rejected (clock-skewed sensors)
     * @param maxAge        readings older than this are rejected (they would be outside raw retention anyway)
     */
    public record Ingest(
            @DefaultValue("1000") int maxBatchSize,
            @DefaultValue("PT5M") Duration maxFutureSkew,
            @DefaultValue("P30D") Duration maxAge) {}
}
