package com.personalplatform.legacy.audit;

import java.time.Instant;
import java.util.Map;

/** Read model of one audit row. {@code detail} never contains ciphertext, shares, keys or tokens. */
public record AuditEvent(
        long seq, Instant at, String actorKind, String actorId, String eventType, Map<String, Object> detail) {}
