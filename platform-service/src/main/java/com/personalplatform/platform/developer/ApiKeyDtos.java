package com.personalplatform.platform.developer;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Bodies for API keys. The key value appears only in {@link Issued}; lists and verification never carry it. */
final class ApiKeyDtos {

    private ApiKeyDtos() {}

    record IssueRequest(
            @NotBlank @Size(max = 80) String name,
            @NotEmpty @Size(max = 20) List<@NotBlank @Size(max = 64) String> scopes,
            Instant expiresAt) {}

    record Issued(
            UUID id,
            UUID appId,
            String name,
            String keyPrefix,
            String key,
            List<String> scopes,
            OffsetDateTime createdAt,
            OffsetDateTime expiresAt) {}

    record KeyView(
            UUID id,
            UUID appId,
            String name,
            String keyPrefix,
            List<String> scopes,
            OffsetDateTime createdAt,
            OffsetDateTime lastUsedAt,
            OffsetDateTime expiresAt,
            OffsetDateTime revokedAt) {}

    record VerifyRequest(@NotBlank String key) {}

    /** What the gateway's exchange needs to mint a service token for a valid key. */
    record Verified(
            UUID keyId,
            UUID appId,
            String ownerUid,
            List<String> scopes,
            List<String> permissions,
            OffsetDateTime expiresAt) {}

    record StatusRequest(@jakarta.validation.constraints.NotNull UUID keyId) {}

    /** A key's current state, for auth's delegation check. */
    enum KeyState { ACTIVE, REVOKED, EXPIRED, APP_DISABLED }

    /** Never carries the key value or its hash. */
    record KeyStatus(UUID keyId, UUID appId, String ownerUid, KeyState state, List<String> permissions) {}

    record ScopeView(String name, String description, List<String> permissions) {}
}
