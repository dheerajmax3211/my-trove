package com.personalplatform.waitingon.temporal;

import org.springframework.boot.diagnostics.AbstractFailureAnalyzer;
import org.springframework.boot.diagnostics.FailureAnalysis;

/** Turns the startup stack trace into a short, actionable message. */
public class TemporalFailureAnalyzer extends AbstractFailureAnalyzer<TemporalUnreachableException> {

    @Override
    protected FailureAnalysis analyze(Throwable rootFailure, TemporalUnreachableException cause) {
        return new FailureAnalysis(
                cause.getMessage() + ": " + (cause.getCause() == null ? "no answer" : cause.getCause().toString()),
                "Start a local dev server with `temporal server start-dev` (see README), point app.temporal.target "
                        + "(env TEMPORAL_TARGET) at a running Temporal frontend, or run without durable follow-ups "
                        + "by setting app.temporal.enabled=false (env TEMPORAL_ENABLED=false).",
                cause);
    }
}
