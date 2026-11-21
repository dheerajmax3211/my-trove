package com.personalplatform.homepulse.ingest;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Pure mapping of one MQTT message (topic + payload bytes) to a reading. No broker, no Spring, no clock: the
 * receive time is an argument. Never throws; anything unusable becomes {@link Rejected} with a reason.
 *
 * <p>Topic: {@code homepulse/{deviceId}/reading}. Payload: JSON object
 * {@code {"watts": 118.4, "volts": 229.8, "amps": 0.52, "ts": 1767225600}} where {@code watts} is required,
 * {@code volts}/{@code amps} optional, and {@code ts} optional (epoch seconds, epoch millis, or ISO-8601; when
 * absent the receive time is used because many cheap sensors have no RTC).
 */
public final class MqttReadingMapper {

    public sealed interface Result permits Mapped, Rejected {}

    public record Mapped(UUID deviceId, ReadingInput reading) implements Result {}

    public record Rejected(String reason) implements Result {}

    static final int MAX_PAYLOAD_BYTES = 2048;
    static final double MAX_WATTS = 1_000_000;
    private static final Pattern TOPIC = Pattern.compile("^homepulse/([0-9a-fA-F-]{36})/reading$");
    private static final JsonMapper JSON = JsonMapper.builder().build();
    /** Numeric timestamps at or above this are milliseconds (1e11 s is year 5138; 1e11 ms is 1973). */
    private static final double MILLIS_THRESHOLD = 1e11;

    private MqttReadingMapper() {}

    public static Result map(String topic, byte[] payload, Instant receivedAt) {
        if (topic == null) {
            return new Rejected("missing topic");
        }
        Matcher m = TOPIC.matcher(topic);
        if (!m.matches()) {
            return new Rejected("topic does not match homepulse/{deviceId}/reading");
        }
        UUID deviceId;
        try {
            deviceId = UUID.fromString(m.group(1));
        } catch (IllegalArgumentException e) {
            return new Rejected("device id in topic is not a UUID");
        }
        if (payload == null || payload.length == 0) {
            return new Rejected("empty payload");
        }
        if (payload.length > MAX_PAYLOAD_BYTES) {
            return new Rejected("payload too large");
        }
        JsonNode root;
        try {
            root = JSON.readTree(payload);
        } catch (JacksonException e) {
            return new Rejected("payload is not valid JSON");
        }
        if (root == null || !root.isObject()) {
            return new Rejected("payload must be a JSON object");
        }
        JsonNode w = root.get("watts");
        if (w == null || !w.isNumber()) {
            return new Rejected("watts is required and must be a number");
        }
        double watts = w.doubleValue();
        if (!Double.isFinite(watts) || watts < 0 || watts > MAX_WATTS) {
            return new Rejected("watts out of range");
        }
        Double volts = optionalNumber(root, "volts");
        if (volts != null && (volts.isNaN() || volts < 0 || volts > 1000)) {
            return new Rejected("volts out of range");
        }
        Double amps = optionalNumber(root, "amps");
        if (amps != null && (amps.isNaN() || amps < 0 || amps > 1000)) {
            return new Rejected("amps out of range");
        }
        if (root.has("volts") && !root.get("volts").isNull() && volts == null) {
            return new Rejected("volts must be a number");
        }
        if (root.has("amps") && !root.get("amps").isNull() && amps == null) {
            return new Rejected("amps must be a number");
        }
        Instant ts;
        JsonNode t = root.get("ts");
        if (t == null || t.isNull()) {
            ts = receivedAt;
        } else if (t.isNumber()) {
            double v = t.doubleValue();
            if (!Double.isFinite(v) || v <= 0) {
                return new Rejected("ts out of range");
            }
            ts = v >= MILLIS_THRESHOLD ? Instant.ofEpochMilli((long) v) : Instant.ofEpochMilli((long) (v * 1000));
        } else if (t.isString()) {
            try {
                ts = Instant.parse(t.stringValue());
            } catch (DateTimeParseException e) {
                return new Rejected("ts is not an ISO-8601 instant");
            }
        } else {
            return new Rejected("ts must be a number or string");
        }
        return new Mapped(deviceId, new ReadingInput(ts, watts, volts, amps));
    }

    private static Double optionalNumber(JsonNode root, String field) {
        JsonNode n = root.get(field);
        if (n == null || n.isNull() || !n.isNumber()) {
            return null;
        }
        double v = n.doubleValue();
        return Double.isFinite(v) ? v : Double.NaN;
    }
}
