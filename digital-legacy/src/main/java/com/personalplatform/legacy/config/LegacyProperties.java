package com.personalplatform.legacy.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("legacy")
public record LegacyProperties(
        @DefaultValue("1048576") long maxCiphertextBytes,
        @DefaultValue("4096") int maxMetadataBytes,
        @DefaultValue("10") int maxTrustees,
        @DefaultValue("14d") Duration inviteTtl,
        @DefaultValue("1h") Duration lateTolerance,
        @DefaultValue Limits limits,
        @DefaultValue Scheduler scheduler,
        @DefaultValue Notifications notifications) {

    /** Bounds the owner's policy must respect. */
    public record Limits(
            @DefaultValue("1h") Duration minInterval,
            @DefaultValue("366d") Duration maxInterval,
            @DefaultValue("0s") Duration minGrace,
            @DefaultValue("90d") Duration maxGrace,
            @DefaultValue("1h") Duration minCoolOff,
            @DefaultValue("30d") Duration maxCoolOff,
            @DefaultValue("90d") Duration maxEscalation,
            @DefaultValue("60d") Duration maxPause,
            @DefaultValue("120d") Duration yearlyPauseBudget) {}

    public record Scheduler(
            @DefaultValue("true") boolean enabled,
            @DefaultValue("30s") Duration fixedDelay,
            @DefaultValue("200") int maxPerTick) {}

    public record Notifications(
            @DefaultValue("5") int maxAttempts, @DefaultValue("2m") Duration retryBackoff) {}
}
