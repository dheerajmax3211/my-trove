package com.personalplatform.notify;

import java.util.UUID;

/**
 * Delivery channel plug-in point. The relay calls {@link #send} once per attempt. Throw any exception to signal
 * failure: the relay retries with backoff and eventually dead-letters. Delivery is at-least-once (a crash between
 * send and commit re-sends), so use {@link Message#id()} to de-duplicate on the receiving side.
 */
public interface NotificationSender {

    /**
     * @param recipientEmail the address the message is delivered to (resolved by the relay)
     * @param replyTo        reply address, or null
     * @param attempt        1 for the first attempt
     */
    record Message(UUID id, String kind, String recipientUid, String recipientEmail, String title, String body,
            String link, String replyTo, int attempt) {}

    void send(Message message) throws Exception;
}
