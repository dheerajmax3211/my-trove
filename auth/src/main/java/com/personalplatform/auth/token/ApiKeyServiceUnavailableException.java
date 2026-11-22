package com.personalplatform.auth.token;

/** The platform service could not be asked, or failed. Nothing was decided about the key. */
public class ApiKeyServiceUnavailableException extends RuntimeException {

    public ApiKeyServiceUnavailableException(String reason) {
        super("The platform service cannot verify API keys right now: " + reason);
    }
}
