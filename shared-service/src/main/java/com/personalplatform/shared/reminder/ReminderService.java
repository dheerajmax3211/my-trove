package com.personalplatform.shared.reminder;

import static com.personalplatform.sql.jooq.shared.shared.Tables.HOUSEHOLD_MEMBERS;
import static com.personalplatform.sql.jooq.shared.shared.Tables.REMINDERS;

import com.personalplatform.shared.audit.AuditService;
import com.personalplatform.shared.common.ApiException;
import com.personalplatform.shared.common.Times;
import com.personalplatform.shared.household.HouseholdAccess;
import com.personalplatform.shared.household.Role;
import com.personalplatform.sql.UuidV7;
import com.personalplatform.sql.jooq.shared.shared.tables.records.RemindersRecord;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jooq.Condition;
import org.jooq.DSLContext;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * CRUD for reminders. Visibility: a personal reminder (household_id null) is visible only to its owner; a household
 * reminder to every member. Changing or cancelling needs to be the creator or a household OWNER.
 */
@Service
public class ReminderService {

    public enum Status { ACTIVE, COMPLETED, CANCELLED }

    public record ReminderView(UUID id, String ownerUid, UUID householdId, String title, Instant dueAt,
            Recurrence recurrence, Status status, Instant lastFiredAt, Instant createdAt) {}

    private final DSLContext dsl;
    private final Clock clock;
    private final HouseholdAccess access;
    private final AuditService audit;

    public ReminderService(DSLContext dsl, Clock clock, HouseholdAccess access, AuditService audit) {
        this.dsl = dsl;
        this.clock = clock;
        this.access = access;
        this.audit = audit;
    }

    @Transactional
    public ReminderView create(String uid, String title, Instant dueAt, Recurrence recurrence, UUID householdId) {
        if (householdId != null) {
            access.requireMember(uid, householdId);
        }
        Instant now = clock.instant();
        UUID id = UuidV7.next();
        dsl.insertInto(REMINDERS)
                .set(REMINDERS.ID, id)
                .set(REMINDERS.OWNER_UID, uid)
                .set(REMINDERS.HOUSEHOLD_ID, householdId)
                .set(REMINDERS.TITLE, title.trim())
                .set(REMINDERS.DUE_AT, Times.odt(dueAt))
                .set(REMINDERS.ANCHOR_AT, Times.odt(dueAt))
                .set(REMINDERS.RECURRENCE, recurrence == null ? null : recurrence.unit().name())
                .set(REMINDERS.RECURRENCE_INTERVAL, recurrence == null ? 1 : recurrence.interval())
                .set(REMINDERS.STATUS, Status.ACTIVE.name())
                .set(REMINDERS.CREATED_AT, Times.odt(now))
                .set(REMINDERS.UPDATED_AT, Times.odt(now))
                .execute();
        audit.record(uid, householdId, "reminder.created", "reminder", id.toString(), Map.of("title", title.trim()));
        return get(uid, id);
    }

    @Transactional(readOnly = true)
    public ReminderView get(String uid, UUID id) {
        return view(loadVisible(uid, id));
    }

    /** Without householdId: caller's personal reminders plus those of every household they belong to. */
    @Transactional(readOnly = true)
    public List<ReminderView> list(String uid, UUID householdId, Status status) {
        Condition scope;
        if (householdId != null) {
            access.requireMember(uid, householdId);
            scope = REMINDERS.HOUSEHOLD_ID.eq(householdId);
        } else {
            scope = REMINDERS.HOUSEHOLD_ID.isNull().and(REMINDERS.OWNER_UID.eq(uid))
                    .or(REMINDERS.HOUSEHOLD_ID.in(DSL.select(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID)
                            .from(HOUSEHOLD_MEMBERS).where(HOUSEHOLD_MEMBERS.MEMBER_UID.eq(uid))));
        }
        if (status != null) {
            scope = scope.and(REMINDERS.STATUS.eq(status.name()));
        }
        return dsl.selectFrom(REMINDERS).where(scope)
                .orderBy(REMINDERS.DUE_AT, REMINDERS.ID)
                .limit(500)
                .fetch(this::view);
    }

    @Transactional
    public ReminderView update(String uid, UUID id, String title, Instant dueAt, Recurrence recurrence) {
        RemindersRecord r = loadModifiable(uid, id);
        if (!Status.ACTIVE.name().equals(r.getStatus())) {
            throw ApiException.conflict("Only active reminders can be changed");
        }
        dsl.update(REMINDERS)
                .set(REMINDERS.TITLE, title.trim())
                .set(REMINDERS.DUE_AT, Times.odt(dueAt))
                .set(REMINDERS.ANCHOR_AT, Times.odt(dueAt))
                .set(REMINDERS.RECURRENCE, recurrence == null ? null : recurrence.unit().name())
                .set(REMINDERS.RECURRENCE_INTERVAL, recurrence == null ? 1 : recurrence.interval())
                .set(REMINDERS.UPDATED_AT, Times.odt(clock.instant()))
                .where(REMINDERS.ID.eq(id))
                .execute();
        audit.record(uid, r.getHouseholdId(), "reminder.updated", "reminder", id.toString(), Map.of("title", title.trim()));
        return get(uid, id);
    }

    @Transactional
    public ReminderView cancel(String uid, UUID id) {
        RemindersRecord r = loadModifiable(uid, id);
        if (Status.ACTIVE.name().equals(r.getStatus())) {
            dsl.update(REMINDERS)
                    .set(REMINDERS.STATUS, Status.CANCELLED.name())
                    .set(REMINDERS.UPDATED_AT, Times.odt(clock.instant()))
                    .where(REMINDERS.ID.eq(id))
                    .execute();
            audit.record(uid, r.getHouseholdId(), "reminder.cancelled", "reminder", id.toString(), new LinkedHashMap<>());
        }
        return get(uid, id);
    }


    // ---- authorization helpers -----------------------------------------------------------------------------

    private RemindersRecord loadVisible(String uid, UUID id) {
        RemindersRecord r = dsl.selectFrom(REMINDERS).where(REMINDERS.ID.eq(id)).fetchOne();
        if (r == null) {
            throw ApiException.notFound("Reminder not found");
        }
        boolean visible = r.getHouseholdId() == null
                ? r.getOwnerUid().equals(uid)
                : access.isMember(uid, r.getHouseholdId());
        if (!visible) {
            throw ApiException.notFound("Reminder not found");
        }
        return r;
    }

    private RemindersRecord loadModifiable(String uid, UUID id) {
        RemindersRecord r = loadVisible(uid, id);
        if (r.getOwnerUid().equals(uid)) {
            return r;
        }
        // household reminder created by someone else: only a household OWNER may change it
        access.requireRole(uid, r.getHouseholdId(), Role.OWNER);
        return r;
    }

    private ReminderView view(RemindersRecord r) {
        Recurrence rec = r.getRecurrence() == null ? null
                : new Recurrence(Recurrence.Unit.valueOf(r.getRecurrence()), r.getRecurrenceInterval());
        return new ReminderView(r.getId(), r.getOwnerUid(), r.getHouseholdId(), r.getTitle(),
                Times.instant(r.getDueAt()), rec, Status.valueOf(r.getStatus()), Times.instant(r.getLastFiredAt()),
                Times.instant(r.getCreatedAt()));
    }
}
