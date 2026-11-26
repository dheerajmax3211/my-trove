package com.personalplatform.homepulse.detect;

import java.util.Map;

/**
 * A condition the detector currently sees. Evidence is a flat, JSON-friendly map (stored with the alert);
 * {@code decidedBy} names the model that judged it.
 */
public record Finding(AlertKind kind, Severity severity, String message, Map<String, Object> evidence, DecidedBy decidedBy) {

    public Finding {
        evidence = Map.copyOf(evidence);
        decidedBy = decidedBy == null ? DecidedBy.MAD : decidedBy;
    }

    /** A finding of the built-in detector. */
    public Finding(AlertKind kind, Severity severity, String message, Map<String, Object> evidence) {
        this(kind, severity, message, evidence, DecidedBy.MAD);
    }
}
