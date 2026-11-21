package com.personalplatform.auth.admin;

import static com.personalplatform.sql.jooq.auth.auth.Tables.AUDIT_LOG;

import com.personalplatform.sql.UuidV7;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jooq.Condition;
import org.jooq.DSLContext;
import org.jooq.JSON;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Append-only audit trail of role changes, suspensions and plan changes. There is deliberately no update or delete. */
@Repository
public class AuditRepository {

    public static final String ROLE_GRANTED = "ROLE_GRANTED";
    public static final String ROLE_REVOKED = "ROLE_REVOKED";
    public static final String USER_SUSPENDED = "USER_SUSPENDED";
    public static final String USER_RESTORED = "USER_RESTORED";
    public static final String PLAN_CHANGED = "PLAN_CHANGED";

    /** One audit entry as returned by the API. */
    public record Entry(UUID id, OffsetDateTime at, UUID actorId, String action, UUID targetId, JsonNode detail) {}

    public record Page(List<Entry> items, long total) {}

    private final DSLContext dsl;
    private final JsonMapper json;

    public AuditRepository(DSLContext dsl, JsonMapper json) {
        this.dsl = dsl;
        this.json = json;
    }

    /** Must run in the same transaction as the change it records. {@code actorId} is null for system actions. */
    public void record(UUID actorId, String action, UUID targetId, Map<String, String> detail) {
        dsl.insertInto(AUDIT_LOG)
                .set(AUDIT_LOG.ID, UuidV7.next())
                .set(AUDIT_LOG.ACTOR_ID, actorId)
                .set(AUDIT_LOG.ACTION, action)
                .set(AUDIT_LOG.TARGET_ID, targetId)
                .set(AUDIT_LOG.DETAIL, JSON.valueOf(json.writeValueAsString(detail)))
                .execute();
    }

    /** Newest first; optionally only entries about one target. */
    public Page list(UUID targetId, int page, int size) {
        Condition where = targetId == null ? DSL.trueCondition() : AUDIT_LOG.TARGET_ID.eq(targetId);
        long total = dsl.fetchCount(AUDIT_LOG, where);
        List<Entry> items = dsl.selectFrom(AUDIT_LOG)
                .where(where)
                .orderBy(AUDIT_LOG.AT.desc(), AUDIT_LOG.ID.desc())
                .limit(size)
                .offset((long) page * size)
                .fetch(r -> new Entry(
                        r.getId(),
                        r.getAt(),
                        r.getActorId(),
                        r.getAction(),
                        r.getTargetId(),
                        json.readTree(r.getDetail().data())));
        return new Page(items, total);
    }
}
