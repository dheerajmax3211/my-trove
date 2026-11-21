package com.personalplatform.consent.consent;

import static com.personalplatform.sql.jooq.consent.consent.Tables.CLIENTS;
import static com.personalplatform.sql.jooq.consent.consent.Tables.GRANTS;

import com.personalplatform.consent.policy.Sensitivity;
import com.personalplatform.consent.policy.TimeWindow;
import com.personalplatform.sql.UuidV7;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
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
public class GrantRepository {

    private final DSLContext dsl;

    public GrantRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    private SelectOnConditionStep<Record> base() {
        return dsl.select(GRANTS.fields())
                .select(CLIENTS.CLIENT_ID, CLIENTS.NAME)
                .from(GRANTS)
                .join(CLIENTS)
                .on(CLIENTS.ID.eq(GRANTS.CLIENT_PK));
    }

    public UUID insert(
            UUID requestId,
            String owner,
            UUID clientPk,
            List<String> scopes,
            String purpose,
            Sensitivity maxSensitivity,
            OffsetDateTime now,
            OffsetDateTime expiresAt,
            Integer maxReads,
            TimeWindow window) {
        UUID id = UuidV7.next();
        dsl.insertInto(GRANTS)
                .set(GRANTS.ID, id)
                .set(GRANTS.REQUEST_ID, requestId)
                .set(GRANTS.OWNER_UID, owner)
                .set(GRANTS.CLIENT_PK, clientPk)
                .set(GRANTS.SCOPES, scopes.toArray(String[]::new))
                .set(GRANTS.PURPOSE, purpose)
                .set(GRANTS.MAX_SENSITIVITY, maxSensitivity.name())
                .set(GRANTS.CREATED_AT, now)
                .set(GRANTS.EXPIRES_AT, expiresAt)
                .set(GRANTS.MAX_READS, maxReads)
                .set(GRANTS.WINDOW_START_HOUR, window == null ? null : (short) window.startHour())
                .set(GRANTS.WINDOW_END_HOUR, window == null ? null : (short) window.endHour())
                .set(GRANTS.WINDOW_ZONE, window == null ? null : window.zone().getId())
                .execute();
        return id;
    }

    public Optional<GrantRow> find(UUID id) {
        return base().where(GRANTS.ID.eq(id)).fetchOptional(GrantRepository::map);
    }

    /** Row-locks the grant: concurrent reads and revocations of one grant are serialised, so max_reads cannot be raced. */
    public Optional<GrantRow> findForUpdate(UUID id) {
        return base().where(GRANTS.ID.eq(id)).forUpdate().of(GRANTS).fetchOptional(GrantRepository::map);
    }

    public Optional<GrantRow> findForOwner(String owner, UUID id) {
        return base().where(GRANTS.ID.eq(id).and(GRANTS.OWNER_UID.eq(owner))).fetchOptional(GrantRepository::map);
    }

    public List<GrantRow> listForOwner(String owner, boolean onlyActive, Instant now) {
        Condition c = GRANTS.OWNER_UID.eq(owner);
        if (onlyActive) {
            OffsetDateTime n = now.atOffset(java.time.ZoneOffset.UTC);
            c = c.and(GRANTS.REVOKED_AT.isNull()).and(GRANTS.EXPIRES_AT.gt(n));
        }
        return base().where(c).orderBy(GRANTS.CREATED_AT.desc()).fetch(GrantRepository::map);
    }

    /** @return true if this call revoked it (false if already revoked) */
    public boolean revoke(UUID id, OffsetDateTime now) {
        return dsl.update(GRANTS)
                .set(GRANTS.REVOKED_AT, now)
                .where(GRANTS.ID.eq(id).and(GRANTS.REVOKED_AT.isNull()))
                .execute() == 1;
    }

    /** Revoke every still-unrevoked grant of a client; returns the (grant id, owner) pairs that changed. */
    public List<UUID> revokeAllForClient(UUID clientPk, OffsetDateTime now) {
        return dsl.update(GRANTS)
                .set(GRANTS.REVOKED_AT, now)
                .where(GRANTS.CLIENT_PK.eq(clientPk).and(GRANTS.REVOKED_AT.isNull()))
                .returning(GRANTS.ID)
                .fetch(GRANTS.ID);
    }

    public void recordRead(UUID id, OffsetDateTime now) {
        dsl.update(GRANTS)
                .set(GRANTS.READS_USED, GRANTS.READS_USED.plus(1))
                .set(GRANTS.LAST_READ_AT, now)
                .where(GRANTS.ID.eq(id))
                .execute();
    }

    private static GrantRow map(Record r) {
        return new GrantRow(
                r.get(GRANTS.ID),
                r.get(GRANTS.REQUEST_ID),
                r.get(GRANTS.OWNER_UID),
                r.get(GRANTS.CLIENT_PK),
                r.get(CLIENTS.CLIENT_ID),
                r.get(CLIENTS.NAME),
                Arrays.asList(r.get(GRANTS.SCOPES)),
                r.get(GRANTS.PURPOSE),
                Sensitivity.valueOf(r.get(GRANTS.MAX_SENSITIVITY)),
                r.get(GRANTS.CREATED_AT).toInstant(),
                r.get(GRANTS.EXPIRES_AT).toInstant(),
                r.get(GRANTS.MAX_READS),
                r.get(GRANTS.READS_USED),
                window(r.get(GRANTS.WINDOW_START_HOUR), r.get(GRANTS.WINDOW_END_HOUR), r.get(GRANTS.WINDOW_ZONE)),
                r.get(GRANTS.REVOKED_AT) == null ? null : r.get(GRANTS.REVOKED_AT).toInstant(),
                r.get(GRANTS.LAST_READ_AT) == null ? null : r.get(GRANTS.LAST_READ_AT).toInstant());
    }

    static TimeWindow window(Short start, Short end, String zone) {
        return start == null || end == null || zone == null
                ? null
                : new TimeWindow(start, end, ZoneId.of(zone));
    }
}
