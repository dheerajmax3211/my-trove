package com.personalplatform.legacy.trustee;

import static com.personalplatform.sql.jooq.legacy.legacy.Tables.APPROVALS;
import static com.personalplatform.sql.jooq.legacy.legacy.Tables.TRUSTEES;

import com.personalplatform.sql.UuidV7;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

/** Votes are unique per (vault, incident epoch, trustee): a repeated vote replaces, it never adds. */
@Repository
public class ApprovalRepository {

    private final DSLContext dsl;

    public ApprovalRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    public void vote(UUID vaultId, int epoch, UUID trusteeId, String decision, Instant at) {
        dsl.insertInto(APPROVALS)
                .set(APPROVALS.ID, UuidV7.next())
                .set(APPROVALS.VAULT_ID, vaultId)
                .set(APPROVALS.EPOCH, epoch)
                .set(APPROVALS.TRUSTEE_ID, trusteeId)
                .set(APPROVALS.DECISION, decision)
                .set(APPROVALS.DECIDED_AT, at.atOffset(ZoneOffset.UTC))
                .onConflict(APPROVALS.VAULT_ID, APPROVALS.EPOCH, APPROVALS.TRUSTEE_ID)
                .doUpdate()
                .set(APPROVALS.DECISION, decision)
                .set(APPROVALS.DECIDED_AT, at.atOffset(ZoneOffset.UTC))
                .execute();
    }

    public Optional<String> decisionOf(UUID vaultId, int epoch, UUID trusteeId) {
        return dsl.select(APPROVALS.DECISION).from(APPROVALS)
                .where(APPROVALS.VAULT_ID.eq(vaultId).and(APPROVALS.EPOCH.eq(epoch))
                        .and(APPROVALS.TRUSTEE_ID.eq(trusteeId)))
                .fetchOptional(APPROVALS.DECISION);
    }

    /** Approvals of the current incident from trustees that are still trustees (revocation withdraws the vote). */
    public int countApprovals(UUID vaultId, int epoch) {
        return dsl.fetchCount(
                dsl.select(APPROVALS.ID).from(APPROVALS).join(TRUSTEES).on(TRUSTEES.ID.eq(APPROVALS.TRUSTEE_ID))
                        .where(APPROVALS.VAULT_ID.eq(vaultId).and(APPROVALS.EPOCH.eq(epoch))
                                .and(APPROVALS.DECISION.eq("APPROVE"))
                                .and(TRUSTEES.STATUS.ne(TrusteeStatus.REVOKED.name()))));
    }

    /** Decision per trustee for the current incident. */
    public Map<UUID, String> decisions(UUID vaultId, int epoch) {
        return dsl.select(APPROVALS.TRUSTEE_ID, APPROVALS.DECISION).from(APPROVALS)
                .where(APPROVALS.VAULT_ID.eq(vaultId).and(APPROVALS.EPOCH.eq(epoch)))
                .fetchStream()
                .collect(Collectors.toMap(r -> r.value1(), r -> r.value2()));
    }
}
