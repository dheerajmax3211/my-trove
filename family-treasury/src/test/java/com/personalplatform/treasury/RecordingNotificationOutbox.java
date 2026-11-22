package com.personalplatform.treasury;

import com.personalplatform.notify.Notification;
import com.personalplatform.notify.NotificationOutbox;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;

/**
 * Test double for the shared outbox: records what would be written instead of writing it. The treasury test database has
 * only the treasury schema, so the shared notifications table is not there. Dedupe keys are honoured like the real one.
 */
class RecordingNotificationOutbox extends NotificationOutbox {

    private final List<Notification> written = new ArrayList<>();
    private final List<String> keys = new ArrayList<>();

    RecordingNotificationOutbox() {
        super(null, Clock.systemUTC());
    }

    @Override
    public synchronized boolean enqueue(Notification n) {
        if (keys.contains(n.dedupeKey())) {
            return false;
        }
        keys.add(n.dedupeKey());
        written.add(n);
        return true;
    }

    /** Everything written so far for this address (email-only notifications have no uid). */
    public synchronized List<Notification> toAddress(String email) {
        return written.stream().filter(n -> email.equals(n.recipientEmail())).toList();
    }
}
