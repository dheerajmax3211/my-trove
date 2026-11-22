package com.personalplatform.notify;

import static com.personalplatform.sql.jooq.shared.shared.Tables.NOTIFICATIONS;

import com.personalplatform.sql.jooq.shared.shared.tables.records.NotificationsRecord;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.jooq.DSLContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Outbox relay: delivers PENDING notifications through the {@link NotificationSender}.
 * Each notification is claimed with {@code FOR UPDATE SKIP LOCKED} in its own short transaction, so relays on several
 * instances never send the same row concurrently and one bad row cannot block the others.
 * The address is the row's own {@code recipient_email}, or else the address on file for its uid. Without either, the
 * attempt fails and is retried like any other failure.
 * On failure: attempts+1 and next_attempt_at = now + base * 2^(attempts-1) (capped); after {@code maxAttempts} the row
 * becomes DEAD and is never retried automatically. Email-only rows (not in any inbox) have their body and link cleared
 * once they are SENT or DEAD.
 */
public class NotificationRelay {

    private static final Logger LOG = LoggerFactory.getLogger(NotificationRelay.class);

    public record Result(int sent, int retried, int dead) {
        public int total() {
            return sent + retried + dead;
        }
    }

    private final DSLContext dsl;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final NotificationSender sender;
    private final ContactDirectory contacts;
    private final int maxAttempts;
    private final Duration baseBackoff;
    private final Duration maxBackoff;

    public NotificationRelay(DSLContext dsl, TransactionTemplate tx, Clock clock, NotificationSender sender,
            ContactDirectory contacts, int maxAttempts, Duration baseBackoff, Duration maxBackoff) {
        this.dsl = dsl;
        this.tx = tx;
        this.clock = clock;
        this.sender = sender;
        this.contacts = contacts;
        this.maxAttempts = maxAttempts;
        this.baseBackoff = baseBackoff;
        this.maxBackoff = maxBackoff;
    }

    /** Dispatches up to {@code limit} due notifications. */
    public Result dispatchDue(int limit) {
        int sent = 0, retried = 0, dead = 0;
        for (int i = 0; i < limit; i++) {
            Outcome o = tx.execute(status -> dispatchOne());
            if (o == null || o == Outcome.NONE) {
                break;
            }
            switch (o) {
                case SENT -> sent++;
                case RETRY -> retried++;
                case DEAD -> dead++;
                default -> {}
            }
        }
        return new Result(sent, retried, dead);
    }

    private enum Outcome { NONE, SENT, RETRY, DEAD }

    private Outcome dispatchOne() {
        Instant now = clock.instant();
        NotificationsRecord n = dsl.selectFrom(NOTIFICATIONS)
                .where(NOTIFICATIONS.STATUS.eq("PENDING").and(NOTIFICATIONS.NEXT_ATTEMPT_AT.le(now.atOffset(ZoneOffset.UTC))))
                .orderBy(NOTIFICATIONS.NEXT_ATTEMPT_AT, NOTIFICATIONS.ID)
                .limit(1)
                .forUpdate()
                .skipLocked()
                .fetchOne();
        if (n == null) {
            return Outcome.NONE;
        }
        int attempt = n.getAttempts() + 1;
        try {
            String address = n.getRecipientEmail() != null ? n.getRecipientEmail() : resolve(n.getRecipientUid());
            sender.send(new NotificationSender.Message(n.getId(), n.getKind(), n.getRecipientUid(), address,
                    n.getTitle(), n.getBody(), n.getLink(), n.getReplyTo(), attempt));
        } catch (Exception e) {
            return recordFailure(n, attempt, now, e);
        }
        var update = dsl.update(NOTIFICATIONS)
                .set(NOTIFICATIONS.STATUS, "SENT")
                .set(NOTIFICATIONS.ATTEMPTS, attempt)
                .set(NOTIFICATIONS.SENT_AT, now.atOffset(ZoneOffset.UTC))
                .set(NOTIFICATIONS.LAST_ERROR, (String) null);
        if (!n.getInApp()) {
            update.set(NOTIFICATIONS.BODY, (String) null).set(NOTIFICATIONS.LINK, (String) null);
        }
        update.where(NOTIFICATIONS.ID.eq(n.getId())).execute();
        return Outcome.SENT;
    }

    private String resolve(String uid) {
        if (uid == null) {
            throw new IllegalStateException("no recipient address");
        }
        return contacts.emailFor(uid).orElseThrow(
                () -> new IllegalStateException("no email address on file for this user"));
    }

    private Outcome recordFailure(NotificationsRecord n, int attempt, Instant now, Exception e) {
        String error = String.valueOf(e);
        if (error.length() > 1000) {
            error = error.substring(0, 1000);
        }
        boolean dead = attempt >= maxAttempts;
        var update = dsl.update(NOTIFICATIONS)
                .set(NOTIFICATIONS.ATTEMPTS, attempt)
                .set(NOTIFICATIONS.LAST_ERROR, error);
        if (dead) {
            update.set(NOTIFICATIONS.STATUS, "DEAD");
            if (!n.getInApp()) {
                update.set(NOTIFICATIONS.BODY, (String) null).set(NOTIFICATIONS.LINK, (String) null);
            }
            LOG.warn("Notification {} dead-lettered after {} attempts: {}", n.getId(), attempt, error);
        } else {
            update.set(NOTIFICATIONS.NEXT_ATTEMPT_AT, now.plus(backoff(attempt)).atOffset(ZoneOffset.UTC));
            LOG.warn("Notification {} attempt {} failed, will retry: {}", n.getId(), attempt, error);
        }
        update.where(NOTIFICATIONS.ID.eq(n.getId())).execute();
        return dead ? Outcome.DEAD : Outcome.RETRY;
    }

    Duration backoff(int attempt) {
        long shift = Math.min(attempt - 1, 30);
        Duration d = baseBackoff.multipliedBy(1L << shift);
        return d.compareTo(maxBackoff) > 0 ? maxBackoff : d;
    }
}
