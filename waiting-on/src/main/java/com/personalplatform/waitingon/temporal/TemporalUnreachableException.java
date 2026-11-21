package com.personalplatform.waitingon.temporal;

/** Startup failure: the configured Temporal server did not answer. Rendered by TemporalFailureAnalyzer. */
public class TemporalUnreachableException extends RuntimeException {

    private final String target;
    private final String namespace;

    public TemporalUnreachableException(String target, String namespace, Throwable cause) {
        super("Cannot reach Temporal at '" + target + "' (namespace '" + namespace + "')", cause);
        this.target = target;
        this.namespace = namespace;
    }

    public String target() {
        return target;
    }

    public String namespace() {
        return namespace;
    }
}
