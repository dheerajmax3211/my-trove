package com.personalplatform.consent.client;

import com.personalplatform.consent.policy.Scope;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** A registered client as stored. {@code secretHash} is a KDF hash, never the secret; it is kept out of toString. */
public record ClientRecord(
        UUID pk,
        String clientId,
        String ownerUid,
        String name,
        String contactEmail,
        String redirectUri,
        List<String> allowedScopes,
        String secretHash,
        Instant createdAt,
        Instant secretRotatedAt,
        Instant disabledAt) {

    public boolean isActive() {
        return disabledAt == null;
    }

    /** Is {@code scope} inside what this client is allowed to ask for? */
    public boolean mayRequest(Scope scope) {
        return allowedScopes.stream().map(Scope::parse).anyMatch(allowed -> allowed.covers(scope));
    }

    @Override
    public String toString() {
        return "ClientRecord[clientId=" + clientId + ", name=" + name + "]";
    }
}
