package com.personalplatform.waitingon;

import com.personalplatform.waitingon.item.WaitingItem;
import com.personalplatform.waitingon.notify.NotificationPort;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/** Captures outbound messages so tests can assert on them. */
class RecordingNotificationPort implements NotificationPort {

    record Nudge(java.util.UUID itemId, String subject, String body, String replyTo) {
    }

    record OwnerMessage(String ownerUid, String subject, String body) {
    }

    final List<Nudge> nudges = new CopyOnWriteArrayList<>();
    final List<OwnerMessage> ownerMessages = new CopyOnWriteArrayList<>();

    @Override
    public void sendNudge(WaitingItem item, String subject, String body, String replyTo) {
        nudges.add(new Nudge(item.id(), subject, body, replyTo));
    }

    @Override
    public void notifyOwner(String ownerUid, String subject, String body) {
        ownerMessages.add(new OwnerMessage(ownerUid, subject, body));
    }
}
