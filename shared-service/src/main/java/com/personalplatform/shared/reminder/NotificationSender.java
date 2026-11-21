package com.personalplatform.shared.reminder;

import java.time.Instant;
import java.util.UUID;

/**
 * Delivery channel plug-in point. Implement this (FCM push, email, ...) and expose it as a Spring bean; set
 * {@code app.notifications.sender} to anything other than {@code logging} to switch the default logger off.
 * Throw any exception to signal failure: the relay retries with backoff and eventually dead-letters.
 * Delivery is at-least-once (a crash between send and commit re-sends), so use {@link Message#id()} to de-duplicate.
 */
public interface NotificationSender {

    record Message(UUID id, UUID reminderId, UUID householdId, String recipientUid, String title, Instant occurrenceAt,
            int attempt) {}

    void send(Message message) throws Exception;
}
