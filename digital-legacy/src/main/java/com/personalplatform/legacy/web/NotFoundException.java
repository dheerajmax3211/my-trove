package com.personalplatform.legacy.web;

/** 404. Also used for "exists but is not yours", so other users' ids are indistinguishable from unknown ones. */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }
}
