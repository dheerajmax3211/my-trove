package com.personalplatform.legacy.notify;

import com.personalplatform.legacy.protocol.ChannelType;

/**
 * A delivery mechanism for one {@link ChannelType}. Implementations must be safe to call more than once for the same
 * message (delivery is at-least-once) and must never log or transmit anything beyond the message below: there are no
 * secrets in it by construction.
 */
public interface NotificationChannel {

    ChannelType type();

    /** Attempts delivery; failures are reported in the result (or by throwing), never by silently dropping. */
    DeliveryResult send(NotificationMessage message, String address);

    record DeliveryResult(boolean delivered, String error) {
        public static DeliveryResult ok() {
            return new DeliveryResult(true, null);
        }

        public static DeliveryResult failed(String error) {
            return new DeliveryResult(false, error);
        }
    }
}
