package com.personalplatform.platform.usage;

/** The payload is not a valid usage event; the message says why and ends up in the dead-letter record header. */
public class InvalidUsageEventException extends RuntimeException {

    public InvalidUsageEventException(String message) {
        super(message);
    }

    public InvalidUsageEventException(String message, Throwable cause) {
        super(message, cause);
    }
}
