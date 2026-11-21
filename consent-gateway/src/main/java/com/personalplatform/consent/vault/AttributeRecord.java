package com.personalplatform.consent.vault;

import com.personalplatform.consent.policy.Sensitivity;
import java.time.Instant;
import tools.jackson.databind.JsonNode;

/** One vault attribute as stored. */
public record AttributeRecord(
        String keyPath, JsonNode value, Sensitivity sensitivity, Instant createdAt, Instant updatedAt) {}
