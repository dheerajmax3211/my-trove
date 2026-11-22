package com.personalplatform.notify;

import static com.personalplatform.sql.jooq.shared.shared.Tables.NOTIFICATIONS;

import com.personalplatform.sql.UuidV7;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.jooq.DSLContext;

/**
 * Transactional outbox writer. Call {@link #enqueue} inside the transaction of the business change that caused the
 * notification: if that transaction rolls back, so does the notification. The relay in shared-service delivers
 * committed rows afterwards, with retries and dead-lettering.
 */
public class NotificationOutbox {

    private static final int MAX_TITLE = 300;
    private static final int MAX_BODY = 4000;

    private final DSLContext dsl;
    private final Clock clock;

    public NotificationOutbox(DSLContext dsl, Clock clock) {
        this.dsl = dsl;
        this.clock = clock;
    }

    /**
     * Stores the notification as PENDING. Returns false, storing nothing, when a notification with the same dedupe key
     * already exists. Must run inside the caller's transaction.
     */
    public boolean enqueue(Notification n) {
        Instant now = clock.instant();
        int inserted = dsl.insertInto(NOTIFICATIONS)
                .set(NOTIFICATIONS.ID, UuidV7.next())
                .set(NOTIFICATIONS.RECIPIENT_UID, n.recipientUid())
                .set(NOTIFICATIONS.RECIPIENT_EMAIL, n.recipientEmail())
                .set(NOTIFICATIONS.KIND, n.kind())
                .set(NOTIFICATIONS.SOURCE, n.source())
                .set(NOTIFICATIONS.TITLE, truncate(n.title(), MAX_TITLE))
                .set(NOTIFICATIONS.BODY, truncate(n.body(), MAX_BODY))
                .set(NOTIFICATIONS.LINK, n.link())
                .set(NOTIFICATIONS.REPLY_TO, n.replyTo())
                .set(NOTIFICATIONS.IN_APP, n.inApp())
                .set(NOTIFICATIONS.DEDUPE_KEY, n.dedupeKey())
                .set(NOTIFICATIONS.OCCURRENCE_AT, now.atOffset(ZoneOffset.UTC))
                .set(NOTIFICATIONS.STATUS, "PENDING")
                .set(NOTIFICATIONS.ATTEMPTS, 0)
                .set(NOTIFICATIONS.NEXT_ATTEMPT_AT, now.atOffset(ZoneOffset.UTC))
                .set(NOTIFICATIONS.CREATED_AT, now.atOffset(ZoneOffset.UTC))
                .onConflict(NOTIFICATIONS.DEDUPE_KEY)
                .doNothing()
                .execute();
        return inserted == 1;
    }

    private static String truncate(String s, int max) {
        if (s == null || s.length() <= max) {
            return s;
        }
        return s.substring(0, max);
    }
}
