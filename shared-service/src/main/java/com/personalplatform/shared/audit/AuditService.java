package com.personalplatform.shared.audit;

import static com.personalplatform.sql.jooq.shared.shared.Tables.AUDIT_EVENTS;

import com.personalplatform.shared.common.Page;
import com.personalplatform.shared.common.Times;
import com.personalplatform.sql.UuidV7;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jooq.Condition;
import org.jooq.DSLContext;
import org.jooq.JSONB;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Append-only audit trail. {@link #record} joins the caller's transaction, so an action and its audit row commit
 * or roll back together. Immutability itself is enforced by a trigger in Postgres (see db/migration/shared_ext).
 */
@Service
public class AuditService {

    public record AuditEvent(UUID id, String actorUid, UUID householdId, String action, String subjectType,
            String subjectId, JsonNode details, Instant createdAt) {}

    private final DSLContext dsl;
    private final Clock clock;
    private final JsonMapper json;

    public AuditService(DSLContext dsl, Clock clock, JsonMapper json) {
        this.dsl = dsl;
        this.clock = clock;
        this.json = json;
    }

    @Transactional
    public void record(String actorUid, UUID householdId, String action, String subjectType, String subjectId,
            Map<String, ?> details) {
        dsl.insertInto(AUDIT_EVENTS)
                .set(AUDIT_EVENTS.ID, UuidV7.next())
                .set(AUDIT_EVENTS.ACTOR_UID, actorUid)
                .set(AUDIT_EVENTS.HOUSEHOLD_ID, householdId)
                .set(AUDIT_EVENTS.ACTION, action)
                .set(AUDIT_EVENTS.SUBJECT_TYPE, subjectType)
                .set(AUDIT_EVENTS.SUBJECT_ID, subjectId)
                .set(AUDIT_EVENTS.DETAILS, JSONB.valueOf(json.writeValueAsString(details == null ? Map.of() : details)))
                .set(AUDIT_EVENTS.CREATED_AT, Times.odt(clock.instant()))
                .execute();
    }

    /** Household feed (caller must already be authorized) or, with a null household, the caller's personal events. */
    @Transactional(readOnly = true)
    public Page<AuditEvent> list(String callerUid, UUID householdId, String action, int page, int size) {
        Condition scope = householdId != null
                ? AUDIT_EVENTS.HOUSEHOLD_ID.eq(householdId)
                : AUDIT_EVENTS.HOUSEHOLD_ID.isNull().and(AUDIT_EVENTS.ACTOR_UID.eq(callerUid));
        if (action != null && !action.isBlank()) {
            scope = scope.and(AUDIT_EVENTS.ACTION.eq(action));
        }
        long total = dsl.fetchCount(AUDIT_EVENTS, scope);
        List<AuditEvent> items = dsl.selectFrom(AUDIT_EVENTS)
                .where(scope)
                .orderBy(AUDIT_EVENTS.CREATED_AT.desc(), AUDIT_EVENTS.ID.desc())
                .limit(size)
                .offset((long) page * size)
                .fetch(r -> new AuditEvent(r.getId(), r.getActorUid(), r.getHouseholdId(), r.getAction(),
                        r.getSubjectType(), r.getSubjectId(), json.readTree(r.getDetails().data()),
                        Times.instant(r.getCreatedAt())));
        return new Page<>(items, page, size, total);
    }
}
