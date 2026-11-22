package com.personalplatform.legacy.notify;

import com.personalplatform.legacy.protocol.ChannelType;
import com.personalplatform.notify.Notification;
import com.personalplatform.notify.NotificationOutbox;

/**
 * Email for digital legacy, through the shared outbox: the message is queued as an email-only notification and the
 * shared-service relay sends it. The dedupe key is the outbox row being delivered, so a retried dispatch queues it once.
 * The message holds no vault content, key material or shares, by construction (see {@link MessageTemplates}).
 */
public class OutboxEmailChannel implements NotificationChannel {

    private final NotificationOutbox outbox;

    public OutboxEmailChannel(NotificationOutbox outbox) {
        this.outbox = outbox;
    }

    @Override
    public ChannelType type() {
        return ChannelType.EMAIL;
    }

    @Override
    public DeliveryResult send(NotificationMessage message, String address) {
        outbox.enqueue(Notification.toAddress(address, message.kind().name(), "digital-legacy", message.subject(),
                message.body(), null, Notification.dedupeKey("legacy-email", message.messageId().toString(), address)));
        return DeliveryResult.ok();
    }
}
