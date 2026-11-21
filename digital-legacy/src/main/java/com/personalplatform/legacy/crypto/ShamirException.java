package com.personalplatform.legacy.crypto;

/** Raised for any malformed, duplicate, mismatched, inconsistent or insufficient set of shares. */
public class ShamirException extends IllegalArgumentException {

    public ShamirException(String message) {
        super(message);
    }
}
