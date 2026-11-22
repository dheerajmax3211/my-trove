package com.personalplatform.consent.support;

import com.personalplatform.notify.Notification;
import com.personalplatform.notify.NotificationOutbox;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;

/**
 * Test double for the shared outbox: records what would be written instead of writing it. The consent test database has
 * only the consent schema, so the shared notifications table is not there. Dedupe keys are honoured like the real one.
 */
public class RecordingNotificationOutbox extends NotificationOutbox {

    private final List<Notification> written = new ArrayList<>();
    private final List<String> keys = new ArrayList<>();

    public RecordingNotificationOutbox() {
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

    /** The notification written for this consent request id. */
    public synchronized Notification forRequest(String requestId) {
        return written.stream().filter(n -> n.dedupeKey().equals(keyFor(requestId))).findFirst().orElseThrow();
    }

    public synchronized long countFor(String requestId) {
        return keys.stream().filter(k -> k.equals(keyFor(requestId))).count();
    }

    private static String keyFor(String requestId) {
        return Notification.dedupeKey("consent-request", requestId);
    }
}
