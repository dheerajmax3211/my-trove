package com.personalplatform.platform.usage;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * @param topic usage events published by the gateway
 * @param dlqTopic where events that can never be stored (malformed, constraint violations) are parked
 * @param retryInitial first wait before re-trying a record whose insert failed (database unavailable), doubling up to
 * @param retryMax the longest wait between two attempts; retries never give up, the offset simply is not committed
 */
@ConfigurationProperties("app.usage")
public record UsageProperties(
        @DefaultValue("platform.usage.v1") String topic,
        @DefaultValue("platform.usage.v1.dlq") String dlqTopic,
        @DefaultValue("500ms") Duration retryInitial,
        @DefaultValue("30s") Duration retryMax) {
}
