package com.personalplatform.legacy.notify;

import static com.personalplatform.sql.jooq.legacy.legacy.Tables.ESCALATION_STEPS;
import static com.personalplatform.sql.jooq.legacy.legacy.Tables.NOTIFICATION_OUTBOX;

import com.personalplatform.legacy.config.Json;
import com.personalplatform.legacy.protocol.Contact;
import com.personalplatform.legacy.protocol.Urgency;
import com.personalplatform.sql.UuidV7;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;

@Repository
public class OutboxRepository {

    private final DSLContext dsl;
    private final Json json;

    public OutboxRepository(DSLContext dsl, Json json) {
        this.dsl = dsl;
        this.json = json;
    }

    /**
     * Records that escalation step {@code stepIndex} of this incident ran. The primary key makes it idempotent:
     * returns false (and the caller must do nothing) if some other transaction already recorded it.
     */
    public boolean recordStep(UUID vaultId, int epoch, int stepIndex, Instant at) {
        return dsl.insertInto(ESCALATION_STEPS)
                .set(ESCALATION_STEPS.VAULT_ID, vaultId)
                .set(ESCALATION_STEPS.EPOCH, epoch)
                .set(ESCALATION_STEPS.STEP_INDEX, stepIndex)
                .set(ESCALATION_STEPS.EXECUTED_AT, at.atOffset(ZoneOffset.UTC))
                .onConflictDoNothing()
                .execute() == 1;
    }

    public boolean enqueue(UUID vaultId, int epoch, int stepIndex, String recipientKind, String recipientKey,
            NotificationKind kind, Urgency urgency, List<Contact> contacts, Instant now) {
        return dsl.insertInto(NOTIFICATION_OUTBOX)
                .set(NOTIFICATION_OUTBOX.ID, UuidV7.next())
                .set(NOTIFICATION_OUTBOX.VAULT_ID, vaultId)
                .set(NOTIFICATION_OUTBOX.EPOCH, epoch)
                .set(NOTIFICATION_OUTBOX.STEP_INDEX, stepIndex)
                .set(NOTIFICATION_OUTBOX.RECIPIENT_KIND, recipientKind)
                .set(NOTIFICATION_OUTBOX.RECIPIENT_KEY, recipientKey)
                .set(NOTIFICATION_OUTBOX.KIND, kind.name())
                .set(NOTIFICATION_OUTBOX.URGENCY, urgency.name())
                .set(NOTIFICATION_OUTBOX.CONTACTS, json.toJsonb(contacts))
                .set(NOTIFICATION_OUTBOX.NEXT_ATTEMPT_AT, now.atOffset(ZoneOffset.UTC))
                .onConflictDoNothing()
                .execute() == 1;
    }

    /** Claims one deliverable row (skipping rows another dispatcher holds). */
    public Optional<PendingNotification> claimPending(Instant now, java.util.Collection<UUID> exclude) {
        var cond = NOTIFICATION_OUTBOX.STATUS.eq("PENDING")
                .and(NOTIFICATION_OUTBOX.NEXT_ATTEMPT_AT.le(now.atOffset(ZoneOffset.UTC)));
        if (!exclude.isEmpty()) {
            cond = cond.and(NOTIFICATION_OUTBOX.ID.notIn(exclude));
        }
        return dsl.selectFrom(NOTIFICATION_OUTBOX).where(cond).orderBy(NOTIFICATION_OUTBOX.NEXT_ATTEMPT_AT)
                .limit(1).forUpdate().skipLocked()
                .fetchOptional(r -> new PendingNotification(
                        r.getId(), r.getVaultId(), r.getEpoch(), r.getStepIndex(), r.getRecipientKind(),
                        r.getRecipientKey(), NotificationKind.valueOf(r.getKind()), Urgency.valueOf(r.getUrgency()),
                        json.read(r.getContacts(), new TypeReference<List<Contact>>() {}), r.getAttempts()));
    }

    public void markSent(UUID id, String channel, Instant now) {
        dsl.update(NOTIFICATION_OUTBOX)
                .set(NOTIFICATION_OUTBOX.STATUS, "SENT")
                .set(NOTIFICATION_OUTBOX.CHANNEL_USED, channel)
                .set(NOTIFICATION_OUTBOX.DELIVERED_AT, now.atOffset(ZoneOffset.UTC))
                .set(NOTIFICATION_OUTBOX.ATTEMPTS, NOTIFICATION_OUTBOX.ATTEMPTS.plus(1))
                .setNull(NOTIFICATION_OUTBOX.LAST_ERROR)
                .where(NOTIFICATION_OUTBOX.ID.eq(id)).execute();
    }

    public void markFailedAttempt(UUID id, boolean giveUp, Instant retryAt, String error) {
        dsl.update(NOTIFICATION_OUTBOX)
                .set(NOTIFICATION_OUTBOX.STATUS, giveUp ? "FAILED" : "PENDING")
                .set(NOTIFICATION_OUTBOX.ATTEMPTS, NOTIFICATION_OUTBOX.ATTEMPTS.plus(1))
                .set(NOTIFICATION_OUTBOX.NEXT_ATTEMPT_AT, retryAt.atOffset(ZoneOffset.UTC))
                .set(NOTIFICATION_OUTBOX.LAST_ERROR, error == null ? null : error.substring(0, Math.min(200, error.length())))
                .where(NOTIFICATION_OUTBOX.ID.eq(id)).execute();
    }

    public record PendingNotification(
            UUID id, UUID vaultId, int epoch, int stepIndex, String recipientKind, String recipientKey,
            NotificationKind kind, Urgency urgency, List<Contact> contacts, int attempts) {}
}
