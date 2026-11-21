package com.personalplatform.consent.policy;

import com.personalplatform.consent.policy.Decision.Reason;
import java.time.Instant;
import java.util.Collection;

/**
 * Pure, stateless authorization decisions. No I/O, no clock of its own: the caller passes {@code now}.
 * Deny by default: ALLOW is returned only at the very end, after every check has passed.
 */
public final class PolicyEngine {

    /** Decide whether {@code attempt} is allowed under {@code grant} at {@code now}. */
    public Decision evaluate(PolicyGrant grant, AccessAttempt attempt, Instant now) {
        if (grant == null) {
            return Decision.deny(Reason.NO_GRANT, "no grant");
        }
        if (attempt == null || now == null || attempt.clientId() == null) {
            return Decision.deny(Reason.INVALID_REQUEST, "malformed access attempt");
        }
        Decision state = evaluateState(grant, attempt, now);
        if (!state.isAllowed()) {
            return state;
        }
        if (attempt.prefixQuery()) {
            boolean any = attempt.resource() == null
                    ? !grant.scopes().isEmpty()
                    : grant.scopes().stream().anyMatch(s -> s.overlaps(attempt.resource()));
            return any ? Decision.allow() : Decision.deny(Reason.SCOPE_NOT_GRANTED, "no approved scope overlaps the requested path");
        }
        if (attempt.resource() == null || !Scope.isValidPath(attempt.resource())) {
            return Decision.deny(Reason.INVALID_REQUEST, "invalid attribute path");
        }
        if (grant.scopes().stream().noneMatch(s -> s.covers(attempt.resource()))) {
            return Decision.deny(Reason.SCOPE_NOT_GRANTED, "attribute is outside the approved scopes");
        }
        return Decision.allow();
    }

    /**
     * Per-attribute filter for query results: is this concrete attribute covered by an approved scope and within the
     * sensitivity ceiling? Used after {@link #evaluate} allowed the query as a whole.
     */
    public boolean mayRelease(PolicyGrant grant, String attributePath, Sensitivity sensitivity) {
        if (grant == null || attributePath == null || sensitivity == null || !Scope.isValidPath(attributePath)) {
            return false;
        }
        return covered(grant.scopes(), attributePath) && !sensitivity.exceeds(grant.maxSensitivity());
    }

    private static boolean covered(Collection<Scope> scopes, String path) {
        return scopes.stream().anyMatch(s -> s.covers(path));
    }

    private Decision evaluateState(PolicyGrant grant, AccessAttempt attempt, Instant now) {
        if (grant.revokedAt() != null && !grant.revokedAt().isAfter(now)) {
            return Decision.deny(Reason.GRANT_REVOKED, "grant was revoked");
        }
        if (!grant.clientId().equals(attempt.clientId())) {
            return Decision.deny(Reason.CLIENT_MISMATCH, "grant belongs to a different client");
        }
        if (grant.expiresAt() == null || !now.isBefore(grant.expiresAt())) {
            return Decision.deny(Reason.GRANT_EXPIRED, "grant expired");
        }
        if (grant.window() != null && !grant.window().contains(now)) {
            return Decision.deny(Reason.OUTSIDE_ALLOWED_HOURS, "outside the allowed hours");
        }
        if (grant.maxReads() != null && grant.readsUsed() >= grant.maxReads()) {
            return Decision.deny(Reason.MAX_READS_EXHAUSTED, "read budget exhausted");
        }
        if (attempt.purpose() != null && !attempt.purpose().equals(grant.purpose())) {
            return Decision.deny(Reason.PURPOSE_MISMATCH, "purpose differs from the approved purpose");
        }
        return Decision.allow();
    }
}
