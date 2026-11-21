package com.personalplatform.consent.consent;

import static com.personalplatform.sql.jooq.consent.consent.Tables.ACCESS_REQUESTS;
import static com.personalplatform.sql.jooq.consent.consent.Tables.CLIENTS;

import com.personalplatform.consent.policy.TimeWindow;
import com.personalplatform.sql.UuidV7;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jooq.Condition;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.jooq.SelectOnConditionStep;
import org.springframework.stereotype.Repository;

@Repository
public class AccessRequestRepository {

    private final DSLContext dsl;

    public AccessRequestRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    private SelectOnConditionStep<Record> base() {
        return dsl.select(ACCESS_REQUESTS.fields())
                .select(CLIENTS.CLIENT_ID, CLIENTS.NAME)
                .from(ACCESS_REQUESTS)
                .join(CLIENTS)
                .on(CLIENTS.ID.eq(ACCESS_REQUESTS.CLIENT_PK));
    }

    public UUID insert(
            String owner,
            UUID clientPk,
            List<String> scopes,
            String purpose,
            int durationSeconds,
            Integer maxReads,
            TimeWindow window,
            OffsetDateTime now) {
        UUID id = UuidV7.next();
        dsl.insertInto(ACCESS_REQUESTS)
                .set(ACCESS_REQUESTS.ID, id)
                .set(ACCESS_REQUESTS.OWNER_UID, owner)
                .set(ACCESS_REQUESTS.CLIENT_PK, clientPk)
                .set(ACCESS_REQUESTS.SCOPES, scopes.toArray(String[]::new))
                .set(ACCESS_REQUESTS.PURPOSE, purpose)
                .set(ACCESS_REQUESTS.DURATION_SECONDS, durationSeconds)
                .set(ACCESS_REQUESTS.MAX_READS, maxReads)
                .set(ACCESS_REQUESTS.WINDOW_START_HOUR, window == null ? null : (short) window.startHour())
                .set(ACCESS_REQUESTS.WINDOW_END_HOUR, window == null ? null : (short) window.endHour())
                .set(ACCESS_REQUESTS.WINDOW_ZONE, window == null ? null : window.zone().getId())
                .set(ACCESS_REQUESTS.STATUS, "PENDING")
                .set(ACCESS_REQUESTS.CREATED_AT, now)
                .execute();
        return id;
    }

    public Optional<AccessRequestRow> findForOwner(String owner, UUID id) {
        return base().where(ACCESS_REQUESTS.ID.eq(id).and(ACCESS_REQUESTS.OWNER_UID.eq(owner)))
                .fetchOptional(AccessRequestRepository::map);
    }

    public Optional<AccessRequestRow> findForClient(UUID clientPk, UUID id) {
        return base().where(ACCESS_REQUESTS.ID.eq(id).and(ACCESS_REQUESTS.CLIENT_PK.eq(clientPk)))
                .fetchOptional(AccessRequestRepository::map);
    }

    public List<AccessRequestRow> listForOwner(String owner, String status) {
        Condition c = ACCESS_REQUESTS.OWNER_UID.eq(owner);
        if (status != null) {
            c = c.and(ACCESS_REQUESTS.STATUS.eq(status));
        }
        return base().where(c).orderBy(ACCESS_REQUESTS.CREATED_AT.desc()).limit(200).fetch(AccessRequestRepository::map);
    }

    public int countPending(UUID clientPk) {
        return dsl.fetchCount(ACCESS_REQUESTS, ACCESS_REQUESTS.CLIENT_PK.eq(clientPk).and(ACCESS_REQUESTS.STATUS.eq("PENDING")));
    }

    /** Atomic PENDING -> newStatus transition; false if the request was not pending (already decided). */
    public boolean decide(String owner, UUID id, String newStatus, String note, OffsetDateTime now) {
        return dsl.update(ACCESS_REQUESTS)
                .set(ACCESS_REQUESTS.STATUS, newStatus)
                .set(ACCESS_REQUESTS.DECIDED_AT, now)
                .set(ACCESS_REQUESTS.DECISION_NOTE, note)
                .where(ACCESS_REQUESTS.ID.eq(id)
                        .and(ACCESS_REQUESTS.OWNER_UID.eq(owner))
                        .and(ACCESS_REQUESTS.STATUS.eq("PENDING")))
                .execute() == 1;
    }

    public Optional<UUID> grantIdForRequest(UUID requestId) {
        return dsl.select(com.personalplatform.sql.jooq.consent.consent.Tables.GRANTS.ID)
                .from(com.personalplatform.sql.jooq.consent.consent.Tables.GRANTS)
                .where(com.personalplatform.sql.jooq.consent.consent.Tables.GRANTS.REQUEST_ID.eq(requestId))
                .fetchOptional(com.personalplatform.sql.jooq.consent.consent.Tables.GRANTS.ID);
    }

    private static AccessRequestRow map(Record r) {
        return new AccessRequestRow(
                r.get(ACCESS_REQUESTS.ID),
                r.get(ACCESS_REQUESTS.OWNER_UID),
                r.get(ACCESS_REQUESTS.CLIENT_PK),
                r.get(CLIENTS.CLIENT_ID),
                r.get(CLIENTS.NAME),
                Arrays.asList(r.get(ACCESS_REQUESTS.SCOPES)),
                r.get(ACCESS_REQUESTS.PURPOSE),
                r.get(ACCESS_REQUESTS.DURATION_SECONDS),
                r.get(ACCESS_REQUESTS.MAX_READS),
                GrantRepository.window(
                        r.get(ACCESS_REQUESTS.WINDOW_START_HOUR),
                        r.get(ACCESS_REQUESTS.WINDOW_END_HOUR),
                        r.get(ACCESS_REQUESTS.WINDOW_ZONE)),
                r.get(ACCESS_REQUESTS.STATUS),
                r.get(ACCESS_REQUESTS.CREATED_AT).toInstant(),
                r.get(ACCESS_REQUESTS.DECIDED_AT) == null ? null : r.get(ACCESS_REQUESTS.DECIDED_AT).toInstant(),
                r.get(ACCESS_REQUESTS.DECISION_NOTE));
    }
}
