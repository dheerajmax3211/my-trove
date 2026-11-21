package com.personalplatform.consent.vault;

import com.personalplatform.consent.audit.AuditEvent;
import com.personalplatform.consent.audit.AuditService;
import com.personalplatform.consent.common.ApiException;
import com.personalplatform.consent.policy.Scope;
import com.personalplatform.consent.policy.Sensitivity;
import java.time.Clock;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Service
public class VaultService {

    static final int MAX_VALUE_CHARS = 64 * 1024;

    private final AttributeRepository attributes;
    private final AuditService audit;
    private final Clock clock;
    private final JsonMapper json;

    public VaultService(AttributeRepository attributes, AuditService audit, Clock clock, JsonMapper json) {
        this.attributes = attributes;
        this.audit = audit;
        this.clock = clock;
        this.json = json;
    }

    @Transactional
    public AttributeRecord create(String owner, String keyPath, JsonNode value, Sensitivity sensitivity) {
        validate(keyPath, value);
        if (!attributes.insert(owner, keyPath, value, sensitivity, now())) {
            throw ApiException.conflict("ATTRIBUTE_EXISTS", "Attribute already exists: " + keyPath);
        }
        audit.append(owner, AuditEvent.VAULT_ATTRIBUTE_CREATED, "OWNER", owner, null, null,
                Map.of("keyPath", keyPath, "sensitivity", sensitivity.name()));
        return attributes.find(owner, keyPath).orElseThrow();
    }

    @Transactional
    public AttributeRecord replace(String owner, String keyPath, JsonNode value, Sensitivity sensitivity) {
        validate(keyPath, value);
        if (!attributes.update(owner, keyPath, value, sensitivity, now())) {
            throw ApiException.notFound("Attribute " + keyPath);
        }
        audit.append(owner, AuditEvent.VAULT_ATTRIBUTE_UPDATED, "OWNER", owner, null, null,
                Map.of("keyPath", keyPath, "sensitivity", sensitivity.name()));
        return attributes.find(owner, keyPath).orElseThrow();
    }

    @Transactional
    public void delete(String owner, String keyPath) {
        requirePath(keyPath);
        if (!attributes.delete(owner, keyPath)) {
            throw ApiException.notFound("Attribute " + keyPath);
        }
        audit.append(owner, AuditEvent.VAULT_ATTRIBUTE_DELETED, "OWNER", owner, null, null, Map.of("keyPath", keyPath));
    }

    @Transactional(readOnly = true)
    public AttributeRecord get(String owner, String keyPath) {
        requirePath(keyPath);
        return attributes.find(owner, keyPath).orElseThrow(() -> ApiException.notFound("Attribute " + keyPath));
    }

    @Transactional(readOnly = true)
    public List<AttributeRecord> list(String owner, String prefix) {
        if (prefix != null && !prefix.isBlank()) {
            requirePath(prefix);
            return attributes.list(owner, prefix);
        }
        return attributes.list(owner, null);
    }

    private void validate(String keyPath, JsonNode value) {
        requirePath(keyPath);
        if (value == null || value.isNull() || value.isMissingNode()) {
            throw ApiException.badRequest("value must be present and not null");
        }
        if (json.writeValueAsString(value).length() > MAX_VALUE_CHARS) {
            throw ApiException.badRequest("value is larger than " + MAX_VALUE_CHARS + " characters");
        }
    }

    private static void requirePath(String keyPath) {
        if (!Scope.isValidPath(keyPath)) {
            throw ApiException.badRequest(
                    "keyPath must be dot-separated segments of [a-z0-9_] (e.g. profile.sizes.shoe), max 255 chars");
        }
    }

    private java.time.OffsetDateTime now() {
        return clock.instant().atOffset(ZoneOffset.UTC);
    }
}
