package com.personalplatform.shared.notify;

import static com.personalplatform.sql.jooq.shared.shared.Tables.NOTIFICATIONS;

import com.personalplatform.shared.common.ApiException;
import com.personalplatform.shared.common.Times;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jooq.Condition;
import org.jooq.DSLContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A user's inbox. Only rows addressed to the caller (recipient_uid) and listed in an inbox (in_app) are visible; every
 * query carries that condition, so one user can never read or mark another user's notifications.
 */
@Service
public class InboxService {

    public record NotificationView(UUID id, String kind, String source, String title, String body, String link,
            UUID reminderId, UUID householdId, String status, int attempts, Instant createdAt, Instant sentAt,
            Instant readAt) {}

    public record UnreadCount(long count) {}

    private static final int PAGE = 200;

    private final DSLContext dsl;
    private final Clock clock;

    public InboxService(DSLContext dsl, Clock clock) {
        this.dsl = dsl;
        this.clock = clock;
    }

    private static Condition inbox(String uid) {
        return NOTIFICATIONS.RECIPIENT_UID.eq(uid).and(NOTIFICATIONS.IN_APP.isTrue());
    }

    /** Newest first. {@code status} (PENDING, SENT, DEAD) narrows to one delivery state. */
    @Transactional(readOnly = true)
    public List<NotificationView> list(String uid, String status) {
        Condition c = inbox(uid);
        if (status != null && !status.isBlank()) {
            c = c.and(NOTIFICATIONS.STATUS.eq(status.toUpperCase()));
        }
        return dsl.selectFrom(NOTIFICATIONS).where(c)
                .orderBy(NOTIFICATIONS.CREATED_AT.desc(), NOTIFICATIONS.ID.desc())
                .limit(PAGE)
                .fetch(InboxService::view);
    }

    @Transactional(readOnly = true)
    public UnreadCount unreadCount(String uid) {
        return new UnreadCount(dsl.fetchCount(NOTIFICATIONS, inbox(uid).and(NOTIFICATIONS.READ_AT.isNull())));
    }

    /** Marks one notification read. Anything the caller cannot see is reported as not found. */
    @Transactional
    public NotificationView markRead(String uid, UUID id) {
        dsl.update(NOTIFICATIONS)
                .set(NOTIFICATIONS.READ_AT, Times.odt(clock.instant()))
                .where(NOTIFICATIONS.ID.eq(id).and(inbox(uid)).and(NOTIFICATIONS.READ_AT.isNull()))
                .execute();
        var row = dsl.selectFrom(NOTIFICATIONS).where(NOTIFICATIONS.ID.eq(id).and(inbox(uid))).fetchOne();
        if (row == null) {
            throw ApiException.notFound("Notification not found");
        }
        return view(row);
    }

    /** Marks every unread notification in the caller's inbox read. Returns how many changed. */
    @Transactional
    public long markAllRead(String uid) {
        return dsl.update(NOTIFICATIONS)
                .set(NOTIFICATIONS.READ_AT, Times.odt(clock.instant()))
                .where(inbox(uid).and(NOTIFICATIONS.READ_AT.isNull()))
                .execute();
    }

    private static NotificationView view(com.personalplatform.sql.jooq.shared.shared.tables.records.NotificationsRecord n) {
        return new NotificationView(n.getId(), n.getKind(), n.getSource(), n.getTitle(), n.getBody(), n.getLink(),
                n.getReminderId(), n.getHouseholdId(), n.getStatus(), n.getAttempts(),
                Times.instant(n.getCreatedAt()), Times.instant(n.getSentAt()), Times.instant(n.getReadAt()));
    }
}
