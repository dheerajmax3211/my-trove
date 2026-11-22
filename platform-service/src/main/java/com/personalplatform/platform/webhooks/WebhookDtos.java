package com.personalplatform.platform.webhooks;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** Bodies for webhooks. A signing secret appears only in {@link Created} and {@link SecretRotated}. */
public final class WebhookDtos {

    private WebhookDtos() {}

    public record CreateRequest(
            @NotBlank @Size(max = 2048) String url,
            @Size(max = 200) String description,
            @NotEmpty @Size(max = 10) List<@NotBlank @Size(max = 64) String> eventTypes) {}

    public record EndpointView(UUID id, UUID appId, String url, String description, List<String> eventTypes,
                               OffsetDateTime createdAt, OffsetDateTime disabledAt) {}

    public record Created(UUID id, UUID appId, String url, String description, List<String> eventTypes, String secret,
                          OffsetDateTime createdAt) {}

    public record SecretRotated(UUID id, String secret, OffsetDateTime rotatedAt) {}

    public record DeliveryView(UUID id, UUID endpointId, UUID eventId, String eventType, String status, int attempts,
                               OffsetDateTime nextAttemptAt, Integer lastStatusCode, String lastError,
                               OffsetDateTime createdAt, OffsetDateTime deliveredAt, UUID replayOf) {}

    public record EventView(String name, String description) {}
}
