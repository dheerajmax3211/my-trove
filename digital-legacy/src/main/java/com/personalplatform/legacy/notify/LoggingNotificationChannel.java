package com.personalplatform.legacy.notify;

import com.personalplatform.legacy.protocol.ChannelType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Development delivery: writes a masked one-line record to the log instead of contacting anyone. */
public class LoggingNotificationChannel implements NotificationChannel {

    private static final Logger LOG = LoggerFactory.getLogger(LoggingNotificationChannel.class);

    private final ChannelType type;

    public LoggingNotificationChannel(ChannelType type) {
        this.type = type;
    }

    @Override
    public ChannelType type() {
        return type;
    }

    @Override
    public DeliveryResult send(NotificationMessage message, String address) {
        String masked = address == null || address.length() <= 4
                ? "***"
                : address.substring(0, 2) + "***" + address.substring(address.length() - 2);
        LOG.info("[{}] {} {} -> {} {} (vault {})", type, message.urgency(), message.kind(),
                message.recipientKind(), masked, message.vaultId());
        return DeliveryResult.ok();
    }
}
