package com.personalplatform.waitingon.notify;

import com.personalplatform.waitingon.item.WaitingItem;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Default port (registered by WaitingOnDefaultsAutoConfiguration unless the app defines its own): writes what would be sent to the log (subjects only; bodies may hold personal data). */
public class LoggingNotificationPort implements NotificationPort {

    private static final Logger LOG = LoggerFactory.getLogger(LoggingNotificationPort.class);

    @Override
    public void sendNudge(WaitingItem item, String subject, String body, String replyTo) {
        LOG.info("[notify] nudge item={} to={} replyTo={} subject='{}' ({} chars)", item.id(),
                item.counterpartyEmail() == null ? "<owner, no counterparty email>" : "counterparty", replyTo,
                subject, body.length());
    }

    @Override
    public void notifyOwner(String ownerUid, String subject, String body) {
        LOG.info("[notify] owner={} subject='{}' ({} chars)", ownerUid, subject, body.length());
    }
}
