package com.personalplatform.auth.token;

import java.util.UUID;

/** Verifies a presented {@code pk_...} API key with the platform service, which owns the key table. */
public interface ApiKeyVerifier {

    /**
     * @throws InvalidApiKeyException when the platform service refuses the key (unknown, wrong, expired or revoked)
     * @throws ApiKeyServiceUnavailableException when the platform service cannot be reached or fails
     */
    VerifiedApiKey verify(String presentedKey);

    /**
     * The key's current state by id, for delegation (the key value is not known then, only its service token).
     *
     * @throws InvalidApiKeyException when the platform service knows no such key
     * @throws ApiKeyServiceUnavailableException when the platform service cannot be reached or fails
     */
    ApiKeyStatus status(UUID keyId);
}
