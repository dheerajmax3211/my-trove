package com.personalplatform.askyourlife.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Ingestion pipeline settings ({@code app.ingest.*}). */
@ConfigurationProperties(prefix = "app.ingest")
public record IngestProperties(
        /** Largest accepted document body, in bytes. */
        @DefaultValue("2097152") long maxBytes,
        @DefaultValue("180") int chunkMaxTokens,
        @DefaultValue("30") int chunkOverlapTokens,
        /** Attempts (including the first) before a job is dead-lettered. */
        @DefaultValue("5") int maxAttempts,
        @DefaultValue("10s") Duration baseBackoff,
        @DefaultValue("15m") Duration maxBackoff,
        /** How long a claimed job stays locked before another worker may take it over (crash recovery). */
        @DefaultValue("5m") Duration lease,
        /** Run the background poller. Tests turn this off and call the worker directly. */
        @DefaultValue("true") boolean schedulerEnabled,
        @DefaultValue("2s") Duration pollInterval,
        /** Jobs handled per poll before sleeping again. */
        @DefaultValue("20") int jobsPerPoll) {}
