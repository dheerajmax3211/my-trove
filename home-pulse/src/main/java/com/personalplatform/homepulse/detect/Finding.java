package com.personalplatform.homepulse.detect;

import java.util.Map;

/** A condition the detector currently sees. Evidence is a flat, JSON-friendly map (stored with the alert). */
public record Finding(AlertKind kind, Severity severity, String message, Map<String, Object> evidence) {

    public Finding {
        evidence = Map.copyOf(evidence);
    }
}
