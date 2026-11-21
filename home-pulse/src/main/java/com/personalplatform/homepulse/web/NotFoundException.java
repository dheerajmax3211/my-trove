package com.personalplatform.homepulse.web;

/** Also used for "exists but belongs to someone else": the API never reveals other owners' ids. */
public class NotFoundException extends RuntimeException {
    public NotFoundException(String what) {
        super(what + " not found");
    }
}
