package com.personalplatform.consent.consent;

import com.personalplatform.consent.audit.AuditEvent;
import com.personalplatform.consent.audit.AuditService;
import com.personalplatform.consent.common.ApiException;
import com.personalplatform.consent.policy.AccessAttempt;
import com.personalplatform.consent.policy.Decision;
import com.personalplatform.consent.policy.PolicyEngine;
import com.personalplatform.consent.policy.PolicyGrant;
import com.personalplatform.consent.policy.Scope;
import com.personalplatform.consent.vault.AttributeRecord;
import com.personalplatform.consent.vault.AttributeRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The only path by which third-party code reads vault data. On EVERY read: lock the live grant row, evaluate the policy
 * engine, release only attributes the grant covers, count the read, and append an audit entry, all in one transaction.
 * Denials are audited too (and still commit: they are returned, not thrown).
 */
@Service
public class GatewayDataService {

    /** {@code decision.isAllowed()} => attributes populated; otherwise denial details only. */
    public record ReadOutcome(Decision decision, UUID grantId, List<AttributeRecord> attributes, Integer readsRemaining, Instant grantExpiresAt) {}

    private final GrantRepository grants;
    private final AttributeRepository attributes;
    private final PolicyEngine engine;
    private final AuditService audit;
    private final Clock clock;

    public GatewayDataService(
            GrantRepository grants, AttributeRepository attributes, PolicyEngine engine, AuditService audit, Clock clock) {
        this.grants = grants;
        this.attributes = attributes;
        this.engine = engine;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional
    public ReadOutcome read(String clientId, UUID grantId, String path, String purpose) {
        String prefix = path == null || path.isBlank() ? null : path;
        if (prefix != null && !Scope.isValidPath(prefix)) {
            throw ApiException.badRequest("path must be dot-separated segments of [a-z0-9_]");
        }
        GrantRow row = grants.findForUpdate(grantId).orElse(null);
        Instant now = clock.instant();
        if (row == null) {
            return new ReadOutcome(Decision.deny(Decision.Reason.NO_GRANT, "no grant"), grantId, List.of(), null, null);
        }
        PolicyGrant policyGrant = row.toPolicy();
        Decision decision = engine.evaluate(policyGrant, AccessAttempt.query(clientId, prefix, purpose), now);
        if (!decision.isAllowed()) {
            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("decision", "DENY");
            detail.put("reason", decision.reason().name());
            detail.put("path", prefix);
            audit.append(row.ownerUid(), AuditEvent.DATA_DENIED, "CLIENT", clientId, row.clientId(), row.id(), detail);
            return new ReadOutcome(decision, grantId, List.of(), null, row.expiresAt());
        }

        List<AttributeRecord> released = new ArrayList<>();
        int withheld = 0;
        for (AttributeRecord a : attributes.list(row.ownerUid(), prefix)) {
            if (engine.mayRelease(policyGrant, a.keyPath(), a.sensitivity())) {
                released.add(a);
            } else if (policyGrant.scopes().stream().anyMatch(s -> s.covers(a.keyPath()))) {
                withheld++; // inside the scopes but above the sensitivity ceiling
            }
        }
        grants.recordRead(row.id(), now.atOffset(ZoneOffset.UTC));
        int used = row.readsUsed() + 1;
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("decision", "ALLOW");
        detail.put("path", prefix);
        detail.put("keys", released.stream().map(AttributeRecord::keyPath).toList());
        detail.put("withheldBySensitivity", withheld);
        detail.put("readsUsed", used);
        audit.append(row.ownerUid(), AuditEvent.DATA_READ, "CLIENT", clientId, row.clientId(), row.id(), detail);
        Integer remaining = row.maxReads() == null ? null : row.maxReads() - used;
        return new ReadOutcome(decision, row.id(), released, remaining, row.expiresAt());
    }
}
