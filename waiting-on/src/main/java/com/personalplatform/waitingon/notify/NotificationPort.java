package com.personalplatform.waitingon.notify;

import com.personalplatform.waitingon.item.WaitingItem;

/**
 * Outbound messages. The only implementation shipped is {@link LoggingNotificationPort}; a real one would use
 * an email provider (to the counterparty) and push/email (to the owner).
 *
 * <p>Implementations must tolerate being called more than once for the same logical message: workflow
 * activities have at-least-once semantics.
 */
public interface NotificationPort {

    /**
     * Sends a reminder to the counterparty. {@code replyTo} is the item's plus-address so the answer comes back
     * through the inbound webhook. If the item has no counterparty email, implementations should surface the text
     * to the owner instead.
     */
    void sendNudge(WaitingItem item, String subject, String body, String replyTo);

    /** Tells the owner something happened (escalation letter ready, reply received, item expired...). */
    void notifyOwner(String ownerUid, String subject, String body);
}
