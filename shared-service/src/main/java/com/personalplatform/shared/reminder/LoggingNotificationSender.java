package com.personalplatform.shared.reminder;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Default sender: writes the notification to the log. Replace with an FCM/email sender in production. */
@Component
@ConditionalOnProperty(name = "app.notifications.sender", havingValue = "logging", matchIfMissing = true)
public class LoggingNotificationSender implements NotificationSender {

    private static final Logger LOG = LoggerFactory.getLogger(LoggingNotificationSender.class);

    @Override
    public void send(Message m) {
        LOG.info("NOTIFY recipient={} notification={} reminder={} occurrence={} title=\"{}\"", m.recipientUid(), m.id(),
                m.reminderId(), m.occurrenceAt(), m.title());
    }
}
