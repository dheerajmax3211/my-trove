package com.personalplatform.auth.token;

/** The platform service refused the key. Deliberately says nothing about why. */
public class InvalidApiKeyException extends RuntimeException {

    public InvalidApiKeyException() {
        super("The API key is invalid, expired or revoked");
    }
}
