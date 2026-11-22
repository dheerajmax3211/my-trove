package com.personalplatform.auth.token;

/** Verifies a presented {@code pk_...} API key with the platform service, which owns the key table. */
public interface ApiKeyVerifier {

    /**
     * @throws InvalidApiKeyException when the platform service refuses the key (unknown, wrong, expired or revoked)
     * @throws ApiKeyServiceUnavailableException when the platform service cannot be reached or fails
     */
    VerifiedApiKey verify(String presentedKey);
}
