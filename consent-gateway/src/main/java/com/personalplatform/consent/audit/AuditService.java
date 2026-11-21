package com.personalplatform.consent.audit;

import static com.personalplatform.sql.jooq.consent.consent.Tables.AUDIT_HEADS;
import static com.personalplatform.sql.jooq.consent.consent.Tables.AUDIT_LOG;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jooq.Condition;
import org.jooq.Cursor;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * Hash-chained, append-only audit log, one chain per owner. {@link #append} must run inside the caller's transaction
 * (MANDATORY), so an action and its audit record commit or roll back together: there is no unaudited access.
 * Appends to the same chain are serialised by a row lock on the chain head.
 */
@Service
public class AuditService {

    private final DSLContext dsl;
    private final Clock clock;
    private final JsonMapper json;

    public AuditService(DSLContext dsl, Clock clock, JsonMapper json) {
        this.dsl = dsl;
        this.clock = clock;
        this.json = json;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public AuditEntry append(
            String ownerUid,
            AuditEvent event,
            String actorType,
            String actorId,
            String clientId,
            UUID grantId,
            Map<String, ?> detail) {
        dsl.insertInto(AUDIT_HEADS)
                .set(AUDIT_HEADS.OWNER_UID, ownerUid)
                .set(AUDIT_HEADS.LAST_SEQ, 0L)
                .set(AUDIT_HEADS.LAST_HASH, AuditHasher.GENESIS)
                .onConflictDoNothing()
                .execute();
        Record head = dsl.select(AUDIT_HEADS.LAST_SEQ, AUDIT_HEADS.LAST_HASH)
                .from(AUDIT_HEADS)
                .where(AUDIT_HEADS.OWNER_UID.eq(ownerUid))
                .forUpdate()
                .fetchOne();
        long seq = head.get(AUDIT_HEADS.LAST_SEQ) + 1;
        String prev = head.get(AUDIT_HEADS.LAST_HASH);
        Instant at = clock.instant().truncatedTo(ChronoUnit.MICROS);
        String detailJson = json.writeValueAsString(detail == null ? Map.of() : detail);
        String hash = AuditHasher.hash(
                prev,
                ownerUid,
                seq,
                event.name(),
                actorType,
                actorId,
                clientId,
                grantId == null ? null : grantId.toString(),
                detailJson,
                at);
        dsl.insertInto(AUDIT_LOG)
                .set(AUDIT_LOG.OWNER_UID, ownerUid)
                .set(AUDIT_LOG.OWNER_SEQ, seq)
                .set(AUDIT_LOG.EVENT_TYPE, event.name())
                .set(AUDIT_LOG.ACTOR_TYPE, actorType)
                .set(AUDIT_LOG.ACTOR_ID, actorId)
                .set(AUDIT_LOG.CLIENT_ID, clientId)
                .set(AUDIT_LOG.GRANT_ID, grantId)
                .set(AUDIT_LOG.DETAIL, detailJson)
                .set(AUDIT_LOG.OCCURRED_AT, at.atOffset(ZoneOffset.UTC))
                .set(AUDIT_LOG.PREV_HASH, prev)
                .set(AUDIT_LOG.ENTRY_HASH, hash)
                .execute();
        dsl.update(AUDIT_HEADS)
                .set(AUDIT_HEADS.LAST_SEQ, seq)
                .set(AUDIT_HEADS.LAST_HASH, hash)
                .where(AUDIT_HEADS.OWNER_UID.eq(ownerUid))
                .execute();
        return new AuditEntry(seq, event.name(), actorType, actorId, clientId, grantId, detailJson, at, prev, hash);
    }

    /** Newest first. {@code beforeSeq} (exclusive) pages backwards; {@code clientId} filters. */
    @Transactional(readOnly = true)
    public List<AuditEntry> history(String ownerUid, int limit, Long beforeSeq, String clientId) {
        Condition c = AUDIT_LOG.OWNER_UID.eq(ownerUid);
        if (beforeSeq != null) {
            c = c.and(AUDIT_LOG.OWNER_SEQ.lt(beforeSeq));
        }
        if (clientId != null && !clientId.isBlank()) {
            c = c.and(AUDIT_LOG.CLIENT_ID.eq(clientId));
        }
        return dsl.selectFrom(AUDIT_LOG)
                .where(c)
                .orderBy(AUDIT_LOG.OWNER_SEQ.desc())
                .limit(Math.max(1, Math.min(limit, 500)))
                .fetch(AuditService::toEntry);
    }

    /**
     * Recompute every hash of the owner's chain from genesis. Reports the first broken link: a modified entry, an
     * edited link, a deleted/inserted entry (sequence gap) or a truncated tail (head disagrees with the last entry).
     */
    @Transactional(readOnly = true)
    public ChainReport verify(String ownerUid) {
        Record head = dsl.select(AUDIT_HEADS.LAST_SEQ, AUDIT_HEADS.LAST_HASH)
                .from(AUDIT_HEADS)
                .where(AUDIT_HEADS.OWNER_UID.eq(ownerUid))
                .fetchOne();
        long headSeq = head == null ? 0 : head.get(AUDIT_HEADS.LAST_SEQ);
        String headHash = head == null ? AuditHasher.GENESIS : head.get(AUDIT_HEADS.LAST_HASH);

        long expectedSeq = 1;
        String prev = AuditHasher.GENESIS;
        long checked = 0;
        try (Cursor<com.personalplatform.sql.jooq.consent.consent.tables.records.AuditLogRecord> cursor = dsl.selectFrom(AUDIT_LOG)
                .where(AUDIT_LOG.OWNER_UID.eq(ownerUid))
                .orderBy(AUDIT_LOG.OWNER_SEQ.asc())
                .fetchSize(500)
                .fetchLazy()) {
            for (var r : cursor) {
                AuditEntry e = toEntry(r);
                if (e.seq() != expectedSeq) {
                    return broken(checked, e.seq() > expectedSeq ? expectedSeq : e.seq(), "SEQUENCE_GAP", headSeq, headHash);
                }
                if (!e.prevHash().equals(prev)) {
                    return broken(checked, e.seq(), "PREV_HASH_MISMATCH", headSeq, headHash);
                }
                String recomputed = AuditHasher.hash(
                        e.prevHash(),
                        ownerUid,
                        e.seq(),
                        e.eventType(),
                        e.actorType(),
                        e.actorId(),
                        e.clientId(),
                        e.grantId() == null ? null : e.grantId().toString(),
                        e.detail(),
                        e.occurredAt());
                if (!recomputed.equals(e.entryHash())) {
                    return broken(checked, e.seq(), "ENTRY_HASH_MISMATCH", headSeq, headHash);
                }
                prev = e.entryHash();
                expectedSeq++;
                checked++;
            }
        }
        if (checked != headSeq || !prev.equals(headHash)) {
            return broken(checked, checked + 1, "HEAD_MISMATCH", headSeq, headHash);
        }
        return new ChainReport(true, checked, null, null, headSeq, headHash);
    }

    private static ChainReport broken(long checked, long seq, String reason, long headSeq, String headHash) {
        return new ChainReport(false, checked, seq, reason, headSeq, headHash);
    }

    private static AuditEntry toEntry(Record r) {
        return new AuditEntry(
                r.get(AUDIT_LOG.OWNER_SEQ),
                r.get(AUDIT_LOG.EVENT_TYPE),
                r.get(AUDIT_LOG.ACTOR_TYPE),
                r.get(AUDIT_LOG.ACTOR_ID),
                r.get(AUDIT_LOG.CLIENT_ID),
                r.get(AUDIT_LOG.GRANT_ID),
                r.get(AUDIT_LOG.DETAIL),
                r.get(AUDIT_LOG.OCCURRED_AT).toInstant(),
                r.get(AUDIT_LOG.PREV_HASH),
                r.get(AUDIT_LOG.ENTRY_HASH));
    }
}
