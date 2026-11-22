package com.personalplatform.waitingon.notify;

import com.personalplatform.notify.Notification;
import com.personalplatform.notify.NotificationOutbox;
import com.personalplatform.waitingon.item.WaitingItem;

/**
 * Real delivery through the shared outbox (platform-notify). Each call writes one row in the caller's transaction; the
 * shared-service relay sends it. Retried activities write the same dedupe key, so nothing is sent twice.
 *
 * <ul>
 *   <li>A nudge goes by email to the counterparty, with the item's plus-address as Reply-To, so the reply comes back
 *       through the inbound webhook. It is not an inbox item for the owner.</li>
 *   <li>With no counterparty address, the nudge text goes to the owner to send themselves.</li>
 *   <li>Owner messages are inbox items and are also emailed to the owner.</li>
 * </ul>
 */
public class OutboxNotificationPort implements NotificationPort {

    static final String SOURCE = "waiting-on";
    static final String LINK = "/waiting-on";

    private final NotificationOutbox outbox;

    public OutboxNotificationPort(NotificationOutbox outbox) {
        this.outbox = outbox;
    }

    @Override
    public void sendNudge(WaitingItem item, String subject, String body, String replyTo) {
        String key = Notification.dedupeKey("waiting-nudge", item.id().toString(), item.status().name(), subject, body);
        if (item.counterpartyEmail() != null && !item.counterpartyEmail().isBlank()) {
            outbox.enqueue(Notification.toAddress(item.counterpartyEmail(), "WAITING_NUDGE", SOURCE, subject, body,
                    replyTo, key));
        } else {
            outbox.enqueue(Notification.toUser(item.ownerUid(), "WAITING_NUDGE_OWNER", SOURCE, subject,
                    "No email address is on file for " + item.counterparty() + ". Please follow up yourself:\n\n" + body,
                    LINK, key));
        }
    }

    @Override
    public void notifyOwner(String ownerUid, String subject, String body) {
        String key = Notification.dedupeKey("waiting-owner", ownerUid, subject, body);
        outbox.enqueue(Notification.toUser(ownerUid, "WAITING_UPDATE", SOURCE, subject, body, LINK, key));
    }
}
