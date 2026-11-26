package com.personalplatform.homepulse.alert;

import static com.personalplatform.sql.jooq.home_pulse.home_pulse.Tables.ALERTS;
import static com.personalplatform.sql.jooq.home_pulse.home_pulse.Tables.APPLIANCES;

import com.personalplatform.homepulse.detect.AlertKind;
import com.personalplatform.homepulse.detect.AlertReconciler.LiveAlert;
import com.personalplatform.homepulse.detect.DecidedBy;
import com.personalplatform.homepulse.detect.Finding;
import com.personalplatform.homepulse.detect.Severity;
import com.personalplatform.sql.UuidV7;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jooq.Condition;
import org.jooq.DSLContext;
import org.jooq.JSON;
import org.jooq.Record;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class AlertRepository {

    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};

    private final DSLContext dsl;
    private final JsonMapper json;

    public AlertRepository(DSLContext dsl, JsonMapper json) {
        this.dsl = dsl;
        this.json = json;
    }

    public UUID insert(String ownerUid, UUID applianceId, Finding f, Instant now) {
        return insert(ownerUid, applianceId, f, now, false);
    }

    /** {@code simulated}: the alert was derived from the built-in simulator's readings. */
    public UUID insert(String ownerUid, UUID applianceId, Finding f, Instant now, boolean simulated) {
        UUID id = UuidV7.next();
        OffsetDateTime t = now.atOffset(ZoneOffset.UTC);
        dsl.insertInto(ALERTS)
                .set(ALERTS.ID, id)
                .set(ALERTS.OWNER_UID, ownerUid)
                .set(ALERTS.APPLIANCE_ID, applianceId)
                .set(ALERTS.KIND, f.kind().name())
                .set(ALERTS.SEVERITY, f.severity().name())
                .set(ALERTS.STATUS, AlertStatus.OPEN.name())
                .set(ALERTS.MESSAGE, trim(f.message()))
                .set(ALERTS.EVIDENCE, evidence(f))
                .set(ALERTS.CLEAR_STREAK, 0)
                .set(ALERTS.OPENED_AT, t)
                .set(ALERTS.UPDATED_AT, t)
                .set(ALERTS.SIMULATED, simulated)
                .set(ALERTS.DECIDED_BY, f.decidedBy().name())
                // the partial unique index (appliance, kind) where live is the dedup backstop for concurrent runs
                .onConflictDoNothing()
                .execute();
        return id;
    }

    /** Condition still present: refresh severity/message/evidence, reset the clear streak. */
    public void refresh(UUID id, Finding f, Instant now) {
        dsl.update(ALERTS)
                .set(ALERTS.SEVERITY, f.severity().name())
                .set(ALERTS.MESSAGE, trim(f.message()))
                .set(ALERTS.EVIDENCE, evidence(f))
                .set(ALERTS.DECIDED_BY, f.decidedBy().name())
                .set(ALERTS.CLEAR_STREAK, 0)
                .set(ALERTS.UPDATED_AT, now.atOffset(ZoneOffset.UTC))
                .where(ALERTS.ID.eq(id), ALERTS.STATUS.in("OPEN", "ACKNOWLEDGED"))
                .execute();
    }

    public void tick(UUID id, int clearStreak, Instant now) {
        dsl.update(ALERTS)
                .set(ALERTS.CLEAR_STREAK, clearStreak)
                .set(ALERTS.UPDATED_AT, now.atOffset(ZoneOffset.UTC))
                .where(ALERTS.ID.eq(id), ALERTS.STATUS.in("OPEN", "ACKNOWLEDGED"))
                .execute();
    }

    public void resolve(UUID id, Instant now) {
        OffsetDateTime t = now.atOffset(ZoneOffset.UTC);
        dsl.update(ALERTS)
                .set(ALERTS.STATUS, AlertStatus.RESOLVED.name())
                .set(ALERTS.RESOLVED_AT, t)
                .set(ALERTS.UPDATED_AT, t)
                .where(ALERTS.ID.eq(id), ALERTS.STATUS.in("OPEN", "ACKNOWLEDGED"))
                .execute();
    }

    /** Closes the live alerts that came from simulated readings (removing or regenerating a simulation). */
    public int resolveSimulated(UUID applianceId, Instant now) {
        OffsetDateTime t = now.atOffset(ZoneOffset.UTC);
        return dsl.update(ALERTS)
                .set(ALERTS.STATUS, AlertStatus.RESOLVED.name())
                .set(ALERTS.RESOLVED_AT, t)
                .set(ALERTS.UPDATED_AT, t)
                .where(ALERTS.APPLIANCE_ID.eq(applianceId), ALERTS.SIMULATED.isTrue(),
                        ALERTS.STATUS.in("OPEN", "ACKNOWLEDGED"))
                .execute();
    }

    public List<LiveAlert> liveForAppliance(UUID applianceId) {
        return dsl.selectFrom(ALERTS)
                .where(ALERTS.APPLIANCE_ID.eq(applianceId), ALERTS.STATUS.in("OPEN", "ACKNOWLEDGED"))
                .fetch(r -> new LiveAlert(r.getId(), AlertKind.valueOf(r.getKind()),
                        Severity.valueOf(r.getSeverity()), r.getClearStreak()));
    }

    public List<Alert> list(String ownerUid, AlertStatus status, UUID applianceId, boolean liveOnly, int limit) {
        Condition c = ALERTS.OWNER_UID.eq(ownerUid);
        if (status != null) {
            c = c.and(ALERTS.STATUS.eq(status.name()));
        } else if (liveOnly) {
            c = c.and(ALERTS.STATUS.in("OPEN", "ACKNOWLEDGED"));
        }
        if (applianceId != null) {
            c = c.and(ALERTS.APPLIANCE_ID.eq(applianceId));
        }
        return dsl.select(ALERTS.fields()).select(APPLIANCES.NAME, APPLIANCES.WARRANTY_END_DATE,
                        APPLIANCES.LAST_SERVICE_DATE, APPLIANCES.NEXT_SERVICE_DATE)
                .from(ALERTS).join(APPLIANCES).on(APPLIANCES.ID.eq(ALERTS.APPLIANCE_ID))
                .where(c)
                .orderBy(ALERTS.OPENED_AT.desc(), ALERTS.ID)
                .limit(limit)
                .fetch(this::map);
    }

    public Optional<Alert> find(String ownerUid, UUID id) {
        return dsl.select(ALERTS.fields()).select(APPLIANCES.NAME, APPLIANCES.WARRANTY_END_DATE,
                        APPLIANCES.LAST_SERVICE_DATE, APPLIANCES.NEXT_SERVICE_DATE)
                .from(ALERTS).join(APPLIANCES).on(APPLIANCES.ID.eq(ALERTS.APPLIANCE_ID))
                .where(ALERTS.ID.eq(id), ALERTS.OWNER_UID.eq(ownerUid))
                .fetchOptional(this::map);
    }

    /** OPEN -> ACKNOWLEDGED. Returns false when it was not OPEN. */
    public boolean acknowledge(String ownerUid, UUID id, Instant now) {
        OffsetDateTime t = now.atOffset(ZoneOffset.UTC);
        return dsl.update(ALERTS)
                .set(ALERTS.STATUS, AlertStatus.ACKNOWLEDGED.name())
                .set(ALERTS.ACKNOWLEDGED_AT, t)
                .set(ALERTS.UPDATED_AT, t)
                .where(ALERTS.ID.eq(id), ALERTS.OWNER_UID.eq(ownerUid), ALERTS.STATUS.eq(AlertStatus.OPEN.name()))
                .execute() == 1;
    }

    private JSON evidence(Finding f) {
        return JSON.valueOf(json.writeValueAsString(f.evidence()));
    }

    private Alert map(Record r) {
        Map<String, Object> evidence = json.readValue(r.get(ALERTS.EVIDENCE).data(), MAP);
        return new Alert(r.get(ALERTS.ID), r.get(ALERTS.APPLIANCE_ID), r.get(APPLIANCES.NAME),
                AlertKind.valueOf(r.get(ALERTS.KIND)), Severity.valueOf(r.get(ALERTS.SEVERITY)),
                AlertStatus.valueOf(r.get(ALERTS.STATUS)), r.get(ALERTS.MESSAGE), evidence,
                r.get(ALERTS.OPENED_AT).toInstant(), r.get(ALERTS.UPDATED_AT).toInstant(),
                r.get(ALERTS.ACKNOWLEDGED_AT) == null ? null : r.get(ALERTS.ACKNOWLEDGED_AT).toInstant(),
                r.get(ALERTS.RESOLVED_AT) == null ? null : r.get(ALERTS.RESOLVED_AT).toInstant(),
                r.get(APPLIANCES.WARRANTY_END_DATE), r.get(APPLIANCES.LAST_SERVICE_DATE), r.get(APPLIANCES.NEXT_SERVICE_DATE),
                r.get(ALERTS.SIMULATED), DecidedBy.valueOf(r.get(ALERTS.DECIDED_BY)));
    }

    private static String trim(String s) {
        return s.length() <= 500 ? s : s.substring(0, 497) + "...";
    }
}
