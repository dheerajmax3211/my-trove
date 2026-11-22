package com.personalplatform.platform.webhooks;

import java.util.UUID;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * A domain event as published to the domain topic: {@code {eventId, type, occurredAt, ownerUid, data}}. The raw JSON is
 * what a delivery carries, so receivers see exactly what the producer wrote.
 */
public record DomainEvent(UUID eventId, String type, String ownerUid, String json) {

    /** The event is not usable: not JSON, or without an eventId, type or ownerUid. */
    public static final class InvalidDomainEventException extends RuntimeException {

        public InvalidDomainEventException(String reason) {
            super(reason);
        }
    }

    public static DomainEvent parse(String raw, JsonMapper mapper) {
        if (raw == null || raw.isBlank()) {
            throw new InvalidDomainEventException("empty event");
        }
        JsonNode node;
        try {
            node = mapper.readTree(raw);
        } catch (RuntimeException e) {
            throw new InvalidDomainEventException("not JSON");
        }
        if (node == null || !node.isObject()) {
            throw new InvalidDomainEventException("not a JSON object");
        }
        UUID eventId;
        try {
            eventId = UUID.fromString(text(node, "eventId"));
        } catch (IllegalArgumentException e) {
            throw new InvalidDomainEventException("eventId is missing or not a UUID");
        }
        String type = text(node, "type");
        String owner = text(node, "ownerUid");
        if (type == null) {
            throw new InvalidDomainEventException("type is missing");
        }
        if (owner == null) {
            throw new InvalidDomainEventException("ownerUid is missing");
        }
        return new DomainEvent(eventId, type, owner, raw);
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isString() && !value.asString().isBlank() ? value.asString() : null;
    }
}
