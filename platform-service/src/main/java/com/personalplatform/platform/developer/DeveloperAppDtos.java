package com.personalplatform.platform.developer;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Request and response bodies for developer apps. Secrets appear only in {@link Created} and {@link SecretRotated}. */
final class DeveloperAppDtos {

    private DeveloperAppDtos() {}

    /** Create and full update take the same body. */
    record AppRequest(
            @NotBlank @Size(max = 80) String name,
            @Size(max = 500) String description,
            @Size(max = 10) List<@Size(max = 2048) String> redirectUris) {}

    /** A developer app as the developer sees it (never with a secret). */
    record App(
            UUID id,
            String clientId,
            String name,
            String description,
            List<String> redirectUris,
            boolean hasClientSecret,
            OffsetDateTime secretRotatedAt,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt,
            OffsetDateTime revokedAt) {}

    /** Returned once, by create. */
    record Created(
            UUID id,
            String clientId,
            String clientSecret,
            String name,
            String description,
            List<String> redirectUris,
            OffsetDateTime createdAt) {}

    /** Returned once, by rotate. */
    record SecretRotated(UUID id, String clientId, String clientSecret, OffsetDateTime rotatedAt) {}
}
