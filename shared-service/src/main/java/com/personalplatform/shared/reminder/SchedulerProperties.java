package com.personalplatform.shared.reminder;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "app.scheduler")
public record SchedulerProperties(
        @DefaultValue("true") boolean enabled,
        @DefaultValue("PT5S") Duration pollInterval,
        @DefaultValue("50") int batchSize,
        @DefaultValue("5") int maxAttempts,
        @DefaultValue("PT30S") Duration baseBackoff,
        @DefaultValue("PT1H") Duration maxBackoff) {}
