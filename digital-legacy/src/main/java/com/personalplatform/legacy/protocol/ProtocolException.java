package com.personalplatform.legacy.protocol;

/** A request that is not allowed in the current protocol state (maps to HTTP 409). */
public class ProtocolException extends RuntimeException {

    public ProtocolException(String message) {
        super(message);
    }
}
