package com.personalplatform.consent.consent;

import com.personalplatform.consent.policy.Sensitivity;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** API response shapes for requests and grants. */
public final class ConsentViews {

    private ConsentViews() {}

    public record RequestView(
            UUID id,
            String clientId,
            String clientName,
            List<String> scopes,
            String purpose,
            int durationSeconds,
            Integer maxReads,
            AllowedHours allowedHours,
            String status,
            Instant createdAt,
            Instant decidedAt,
            String decisionNote,
            UUID grantId,
            Instant expiresAt) {

        /**
         * {@code expiresAt} is when an undecided request stops being approvable ({@code createdAt + request-ttl}, the
         * server's setting); null once the owner approved or denied it.
         */
        static RequestView of(AccessRequestRow r, boolean expired, UUID grantId, Instant expiresAt) {
            return new RequestView(r.id(), r.clientId(), r.clientName(), r.scopes(), r.purpose(), r.durationSeconds(),
                    r.maxReads(), AllowedHours.of(r.window()), expired ? "EXPIRED" : r.status(), r.createdAt(),
                    r.decidedAt(), r.decisionNote(), grantId, "PENDING".equals(r.status()) ? expiresAt : null);
        }
    }

    public record GrantView(
            UUID id,
            String clientId,
            String clientName,
            List<String> scopes,
            String purpose,
            Sensitivity maxSensitivity,
            Instant createdAt,
            Instant expiresAt,
            Integer maxReads,
            int readsUsed,
            AllowedHours allowedHours,
            Instant revokedAt,
            Instant lastReadAt,
            String status) {

        static GrantView of(GrantRow g, Instant now) {
            return new GrantView(g.id(), g.clientId(), g.clientName(), g.scopes(), g.purpose(), g.maxSensitivity(),
                    g.createdAt(), g.expiresAt(), g.maxReads(), g.readsUsed(), AllowedHours.of(g.window()),
                    g.revokedAt(), g.lastReadAt(), g.status(now));
        }
    }
}
