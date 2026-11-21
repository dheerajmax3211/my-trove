package com.personalplatform.platform.usage;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * Parses and validates the Kafka payload. Strict about the fields the schema needs (a violation would otherwise fail
 * the insert and be retried forever), lenient about everything else: unknown fields are ignored so the contract can
 * grow, optional fields default, {@code ts} may be an ISO-8601 instant / offset date-time or epoch milliseconds.
 */
@Component
public class UsageEventParser {

    private static final Instant MIN_TS = Instant.parse("2020-01-01T00:00:00Z");
    private static final Instant MAX_TS = Instant.parse("2100-01-01T00:00:00Z");

    private final JsonMapper mapper = JsonMapper.builder()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    /** Wire shape: everything nullable so a missing or mistyped field is reported by name instead of as a parse error. */
    record Raw(String eventId, Object ts, String requestId, String principalType, String principalId, String appId,
                       String service, String method, String routeTemplate, Integer status, Long latencyMs,
                       Long requestBytes, Long responseBytes, String plan, Boolean rateLimited) {
    }

    public UsageEvent parse(String payload) {
        if (payload == null || payload.isBlank()) {
            throw new InvalidUsageEventException("empty payload");
        }
        Raw raw;
        try {
            raw = mapper.readValue(payload, Raw.class);
        } catch (JacksonException e) {
            throw new InvalidUsageEventException("not a valid usage event JSON object: " + firstLine(e.getOriginalMessage()), e);
        }
        if (raw == null) {
            throw new InvalidUsageEventException("payload is JSON null");
        }
        UUID eventId = uuid(raw.eventId());
        Instant ts = instant(raw.ts());
        PrincipalType type = principalType(raw.principalType());
        String principalId = text("principalId", raw.principalId(), 128, true);
        String service = text("service", raw.service(), 64, true);
        String method = text("method", raw.method(), 16, true);
        String route = text("routeTemplate", raw.routeTemplate(), 256, true);
        int status = raw.status() == null ? fail("status is required")
                : raw.status() >= 100 && raw.status() <= 599 ? raw.status() : fail("status must be 100..599");
        long latency = raw.latencyMs() == null ? fail("latencyMs is required")
                : raw.latencyMs() >= 0 && raw.latencyMs() <= Integer.MAX_VALUE ? raw.latencyMs() : fail("latencyMs out of range");
        return new UsageEvent(eventId, ts,
                text("requestId", raw.requestId(), 128, false), type, principalId,
                text("appId", raw.appId(), 128, false), service, method, route, status, (int) latency,
                bytes("requestBytes", raw.requestBytes()), bytes("responseBytes", raw.responseBytes()),
                text("plan", raw.plan(), 32, false), Boolean.TRUE.equals(raw.rateLimited()));
    }

    private static UUID uuid(String value) {
        if (value == null || value.isBlank()) {
            fail("eventId is required");
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            throw new InvalidUsageEventException("eventId is not a UUID");
        }
    }

    private static Instant instant(Object value) {
        Instant ts;
        if (value == null) {
            throw new InvalidUsageEventException("ts is required");
        } else if (value instanceof Number n) {
            ts = Instant.ofEpochMilli(n.longValue());
        } else {
            String s = value.toString();
            try {
                ts = Instant.parse(s);
            } catch (DateTimeParseException notInstant) {
                try {
                    ts = OffsetDateTime.parse(s).toInstant();
                } catch (DateTimeParseException e) {
                    throw new InvalidUsageEventException("ts is not an ISO-8601 timestamp or epoch milliseconds");
                }
            }
        }
        // each distinct 7 day window is a hypertable chunk, so a seconds / millis mix-up must not be stored
        if (ts.isBefore(MIN_TS) || ts.isAfter(MAX_TS)) {
            throw new InvalidUsageEventException("ts outside 2020..2100");
        }
        return ts;
    }

    private static PrincipalType principalType(String value) {
        if (value == null) {
            fail("principalType is required");
        }
        try {
            return PrincipalType.valueOf(value);
        } catch (IllegalArgumentException e) {
            throw new InvalidUsageEventException("principalType must be one of USER, API_KEY, CONSENT_CLIENT, ANON");
        }
    }

    private static String text(String name, String value, int max, boolean required) {
        if (value == null || value.isBlank()) {
            if (required) {
                fail(name + " is required");
            }
            return null;
        }
        if (value.length() > max) {
            fail(name + " longer than " + max + " characters");
        }
        return value;
    }

    private static long bytes(String name, Long value) {
        if (value == null) {
            return 0;
        }
        if (value < 0) {
            fail(name + " must not be negative");
        }
        return value;
    }

    private static int fail(String message) {
        throw new InvalidUsageEventException(message);
    }

    private static String firstLine(String s) {
        if (s == null) {
            return "";
        }
        int nl = s.indexOf('\n');
        return nl < 0 ? s : s.substring(0, nl);
    }
}
