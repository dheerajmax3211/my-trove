package com.personalplatform.legacy.audit;

import static com.personalplatform.sql.jooq.legacy.legacy.Tables.AUDIT_LOG;

import com.personalplatform.legacy.config.Json;
import com.personalplatform.legacy.config.Tokens;
import com.personalplatform.sql.UuidV7;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jooq.DSLContext;
import org.jooq.Record4;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;

/**
 * Appends to and reads the audit trail. The table is append-only and hash-chained by database triggers (see the
 * {@code legacy_ext} migrations): this service can only INSERT, and even a bug here could not rewrite history.
 * Events are written in the caller's transaction, so a state change and its audit record commit or roll back together.
 */
@Service
public class AuditService {

    private final DSLContext dsl;
    private final Json json;
    private final Clock clock;

    public AuditService(DSLContext dsl, Json json, Clock clock) {
        this.dsl = dsl;
        this.json = json;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(UUID vaultId, Actor actor, String eventType, Map<String, Object> detail) {
        record(vaultId, actor, eventType, detail, clock.instant());
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(UUID vaultId, Actor actor, String eventType, Map<String, Object> detail, Instant at) {
        dsl.insertInto(AUDIT_LOG)
                .set(AUDIT_LOG.ID, UuidV7.next())
                .set(AUDIT_LOG.VAULT_ID, vaultId)
                .set(AUDIT_LOG.AT, at.atOffset(ZoneOffset.UTC))
                .set(AUDIT_LOG.ACTOR_KIND, actor.kind())
                .set(AUDIT_LOG.ACTOR_ID, actor.id())
                .set(AUDIT_LOG.EVENT_TYPE, eventType)
                .set(AUDIT_LOG.DETAIL, json.toJsonb(detail == null ? Map.of() : detail))
                .execute();
    }

    /** Newest events first. */
    @Transactional(readOnly = true)
    public List<AuditEvent> timeline(UUID vaultId, int limit) {
        return dsl.select(AUDIT_LOG.VAULT_SEQ, AUDIT_LOG.AT, AUDIT_LOG.ACTOR_KIND, AUDIT_LOG.ACTOR_ID,
                        AUDIT_LOG.EVENT_TYPE, AUDIT_LOG.DETAIL)
                .from(AUDIT_LOG)
                .where(AUDIT_LOG.VAULT_ID.eq(vaultId))
                .orderBy(AUDIT_LOG.VAULT_SEQ.desc())
                .limit(limit)
                .fetch(r -> new AuditEvent(
                        r.get(AUDIT_LOG.VAULT_SEQ),
                        r.get(AUDIT_LOG.AT).toInstant(),
                        r.get(AUDIT_LOG.ACTOR_KIND),
                        r.get(AUDIT_LOG.ACTOR_ID),
                        r.get(AUDIT_LOG.EVENT_TYPE),
                        json.read(r.get(AUDIT_LOG.DETAIL), new TypeReference<Map<String, Object>>() {})));
    }

    @Transactional(readOnly = true)
    public ChainStatus verify(UUID vaultId) {
        Record4<Boolean, Long, byte[], Long> r = dsl.select(
                        DSL.field("ok", Boolean.class),
                        DSL.field("length", Long.class),
                        DSL.field("head_hash", byte[].class),
                        DSL.field("first_bad_seq", Long.class))
                .from("legacy.verify_audit_chain({0})", DSL.val(vaultId))
                .fetchOne();
        return new ChainStatus(
                Boolean.TRUE.equals(r.value1()),
                r.value2() == null ? 0 : r.value2(),
                r.value3() == null ? null : Tokens.hex(r.value3()),
                r.value4());
    }
}
