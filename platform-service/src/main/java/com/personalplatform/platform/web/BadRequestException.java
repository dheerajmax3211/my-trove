package com.personalplatform.platform.web;

/** The caller sent something unacceptable; becomes a 400 problem body. */
public class BadRequestException extends RuntimeException {

    public BadRequestException(String message) {
        super(message);
    }
}
