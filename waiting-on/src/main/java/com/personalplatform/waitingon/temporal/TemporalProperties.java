package com.personalplatform.waitingon.temporal;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param enabled        false: no Temporal client, worker or workflows at all; items are stored but never followed
 *                       up automatically (used by tests and for running the API without a Temporal server)
 * @param target         host:port of the Temporal frontend (gRPC)
 * @param namespace      Temporal namespace
 * @param taskQueue      task queue the embedded worker polls
 * @param tls            use TLS to the frontend (needed for Temporal Cloud)
 * @param connectTimeout how long startup waits for the server before failing with a clear error
 */
@ConfigurationProperties(prefix = "app.temporal")
public record TemporalProperties(Boolean enabled, String target, String namespace, String taskQueue, Boolean tls,
        Duration connectTimeout) {

    public TemporalProperties {
        enabled = enabled == null || enabled;
        target = blankTo(target, "127.0.0.1:7233");
        namespace = blankTo(namespace, "default");
        taskQueue = blankTo(taskQueue, "waiting-on-follow-up");
        tls = tls != null && tls;
        connectTimeout = connectTimeout == null ? Duration.ofSeconds(10) : connectTimeout;
    }

    private static String blankTo(String v, String dflt) {
        return v == null || v.isBlank() ? dflt : v;
    }
}
