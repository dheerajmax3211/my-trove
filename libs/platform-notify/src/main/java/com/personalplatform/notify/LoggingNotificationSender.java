package com.personalplatform.notify;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Default sender when email is off: logs the recipient and title, never the body or link. */
public class LoggingNotificationSender implements NotificationSender {

    private static final Logger LOG = LoggerFactory.getLogger(LoggingNotificationSender.class);

    @Override
    public void send(Message m) {
        LOG.info("NOTIFY kind={} notification={} recipientUid={} recipientEmail={} title=\"{}\"", m.kind(), m.id(),
                m.recipientUid(), m.recipientEmail(), m.title());
    }
}
