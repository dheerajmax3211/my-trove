package com.personalplatform.consent.policy;

/**
 * One attempted read. {@code resource} is an attribute path; with {@code prefixQuery} it is a path prefix
 * ("everything under profile.sizes") and null means "everything this grant covers".
 */
public record AccessAttempt(String clientId, String resource, String purpose, boolean prefixQuery) {

    public static AccessAttempt exact(String clientId, String attributePath, String purpose) {
        return new AccessAttempt(clientId, attributePath, purpose, false);
    }

    public static AccessAttempt query(String clientId, String pathPrefix, String purpose) {
        return new AccessAttempt(clientId, pathPrefix, purpose, true);
    }
}
