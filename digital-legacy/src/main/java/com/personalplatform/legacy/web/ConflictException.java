package com.personalplatform.legacy.web;

/** 409: the request is valid but not allowed in the current state. */
public class ConflictException extends RuntimeException {

    public ConflictException(String message) {
        super(message);
    }
}
