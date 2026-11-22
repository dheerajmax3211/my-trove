package com.personalplatform.shared.reminder;

import static com.personalplatform.sql.jooq.shared.shared.Tables.HOUSEHOLD_MEMBERS;
import static com.personalplatform.sql.jooq.shared.shared.Tables.NOTIFICATIONS;
import static com.personalplatform.sql.jooq.shared.shared.Tables.REMINDERS;

import com.personalplatform.notify.Notification;
import com.personalplatform.shared.common.Times;
import com.personalplatform.sql.UuidV7;
import com.personalplatform.sql.jooq.shared.shared.tables.records.RemindersRecord;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;
import org.jooq.DSLContext;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Claims due reminders and turns each into outbox rows, atomically.
 *
 * <p>One transaction per batch: {@code SELECT ... FOR UPDATE SKIP LOCKED} locks the due rows (other instances skip
 * them instead of waiting), then for every claimed reminder we insert one {@code notifications} row per recipient
 * and either advance {@code due_at} to the next occurrence (recurring) or mark it COMPLETED. All of that commits
 * together, so a crash can never lose a fire or fire it twice; the unique key
 * {@code (reminder_id, occurrence_at, recipient_uid)} is a second line of defence.
 *
 * <p>Plain class (not a Spring-proxied bean) so tests can run several independent "instances" side by side.
 */
public class ReminderEngine {

    private final DSLContext dsl;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final int batchSize;
    private final Consumer<List<UUID>> afterClaim;

    public ReminderEngine(DSLContext dsl, TransactionTemplate tx, Clock clock, int batchSize) {
        this(dsl, tx, clock, batchSize, ids -> {});
    }

    /** {@code afterClaim} runs inside the claiming transaction, after the row locks are taken (test hook). */
    public ReminderEngine(DSLContext dsl, TransactionTemplate tx, Clock clock, int batchSize,
            Consumer<List<UUID>> afterClaim) {
        this.dsl = dsl;
        this.tx = tx;
        this.clock = clock;
        this.batchSize = batchSize;
        this.afterClaim = afterClaim;
    }

    /** Processes up to one batch of due reminders; returns the ids of the reminders this call fired. */
    public List<UUID> fireDue() {
        return tx.execute(status -> {
            Instant now = clock.instant();
            List<RemindersRecord> claimed = dsl.selectFrom(REMINDERS)
                    .where(REMINDERS.STATUS.eq("ACTIVE").and(REMINDERS.DUE_AT.le(Times.odt(now))))
                    .orderBy(REMINDERS.DUE_AT, REMINDERS.ID)
                    .limit(batchSize)
                    .forUpdate()
                    .skipLocked()
                    .fetch();
            afterClaim.accept(claimed.stream().map(RemindersRecord::getId).toList());
            for (RemindersRecord r : claimed) {
                fire(r, now);
            }
            return claimed.stream().map(RemindersRecord::getId).toList();
        });
    }

    private void fire(RemindersRecord r, Instant now) {
        List<String> recipients = r.getHouseholdId() == null
                ? List.of(r.getOwnerUid())
                : dsl.select(HOUSEHOLD_MEMBERS.MEMBER_UID).from(HOUSEHOLD_MEMBERS)
                        .where(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID.eq(r.getHouseholdId()))
                        .orderBy(HOUSEHOLD_MEMBERS.MEMBER_UID)
                        .fetch(HOUSEHOLD_MEMBERS.MEMBER_UID);
        for (String recipient : recipients) {
            dsl.insertInto(NOTIFICATIONS)
                    .set(NOTIFICATIONS.ID, UuidV7.next())
                    .set(NOTIFICATIONS.REMINDER_ID, r.getId())
                    .set(NOTIFICATIONS.HOUSEHOLD_ID, r.getHouseholdId())
                    .set(NOTIFICATIONS.RECIPIENT_UID, recipient)
                    .set(NOTIFICATIONS.KIND, "REMINDER")
                    .set(NOTIFICATIONS.SOURCE, "shared")
                    .set(NOTIFICATIONS.TITLE, r.getTitle())
                    .set(NOTIFICATIONS.IN_APP, true)
                    .set(NOTIFICATIONS.DEDUPE_KEY, Notification.dedupeKey("reminder", r.getId().toString(),
                            r.getDueAt().toInstant().toString(), recipient))
                    .set(NOTIFICATIONS.OCCURRENCE_AT, r.getDueAt())
                    .set(NOTIFICATIONS.STATUS, "PENDING")
                    .set(NOTIFICATIONS.NEXT_ATTEMPT_AT, Times.odt(now))
                    .set(NOTIFICATIONS.CREATED_AT, Times.odt(now))
                    .onConflictDoNothing()
                    .execute();
        }
        var update = dsl.update(REMINDERS)
                .set(REMINDERS.LAST_FIRED_AT, Times.odt(now))
                .set(REMINDERS.UPDATED_AT, Times.odt(now));
        if (r.getRecurrence() == null) {
            update.set(REMINDERS.STATUS, "COMPLETED");
        } else {
            Recurrence rule = new Recurrence(Recurrence.Unit.valueOf(r.getRecurrence()), r.getRecurrenceInterval());
            update.set(REMINDERS.DUE_AT, Times.odt(rule.nextAfter(Times.instant(r.getAnchorAt()), now)));
        }
        update.where(REMINDERS.ID.eq(r.getId())).execute();
    }
}
