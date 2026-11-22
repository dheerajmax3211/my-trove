package com.personalplatform.auth.token;

import java.util.List;
import java.util.UUID;

/** A key the platform service accepted: its identity, owner, and what it may do. */
public record VerifiedApiKey(UUID keyId, UUID appId, String ownerUid, List<String> scopes, List<String> permissions) {

    public VerifiedApiKey {
        scopes = scopes == null ? List.of() : List.copyOf(scopes);
        permissions = permissions == null ? List.of() : List.copyOf(permissions);
    }
}
