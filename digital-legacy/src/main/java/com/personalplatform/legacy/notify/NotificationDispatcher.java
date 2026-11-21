package com.personalplatform.legacy.notify;

import com.personalplatform.legacy.audit.Actor;
import com.personalplatform.legacy.audit.AuditService;
import com.personalplatform.legacy.config.LegacyProperties;
import com.personalplatform.legacy.protocol.ChannelType;
import com.personalplatform.legacy.protocol.Contact;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Delivers outbox rows. Each row is claimed with {@code FOR UPDATE SKIP LOCKED} in its own transaction, so any number
 * of dispatcher instances share the work without sending the same row twice at the same time; a crash after sending
 * but before commit re-sends (at-least-once, hence the idempotent, secret-free message content).
 *
 * <p>Fallback order: the row's contacts are already ordered by the escalation step's channel preference; the first
 * contact whose channel succeeds wins, the rest are fallbacks. If all fail, the row is retried with backoff and
 * finally marked FAILED (and audited).
 */
@Service
public class NotificationDispatcher {

    private static final Logger LOG = LoggerFactory.getLogger(NotificationDispatcher.class);

    private final OutboxRepository outbox;
    private final Map<ChannelType, NotificationChannel> channels = new EnumMap<>(ChannelType.class);
    private final AuditService audit;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final LegacyProperties props;

    public NotificationDispatcher(OutboxRepository outbox, List<NotificationChannel> channelBeans, AuditService audit,
            TransactionTemplate tx, Clock clock, LegacyProperties props) {
        this.outbox = outbox;
        for (NotificationChannel c : channelBeans) {
            channels.putIfAbsent(c.type(), c); // injection order = precedence order: first bean per type wins
        }
        this.audit = audit;
        this.tx = tx;
        this.clock = clock;
        this.props = props;
    }

    /** Delivers everything currently due; returns how many rows were handled. */
    public int dispatchPending(int max) {
        int handled = 0;
        Set<UUID> attempted = new HashSet<>();
        while (handled < max) {
            Boolean did = tx.execute(status -> {
                Instant now = clock.instant();
                var next = outbox.claimPending(now, attempted);
                if (next.isEmpty()) {
                    return false;
                }
                attempted.add(next.get().id());
                deliver(next.get(), now);
                return true;
            });
            if (!Boolean.TRUE.equals(did)) {
                break;
            }
            handled++;
        }
        return handled;
    }

    private void deliver(OutboxRepository.PendingNotification n, Instant now) {
        NotificationMessage message = MessageTemplates.render(n);
        List<String> errors = new ArrayList<>();
        for (Contact contact : n.contacts()) {
            NotificationChannel channel = channels.get(contact.channel());
            if (channel == null) {
                errors.add(contact.channel() + ": no channel configured");
                continue;
            }
            try {
                NotificationChannel.DeliveryResult result = channel.send(message, contact.address());
                if (result.delivered()) {
                    outbox.markSent(n.id(), contact.channel().name(), now);
                    audit.record(n.vaultId(), Actor.system(), "NOTIFICATION_SENT", Map.of(
                            "kind", n.kind().name(), "recipient", n.recipientKind(), "channel", contact.channel().name(),
                            "step", n.stepIndex(), "fallbacksTried", errors.size()), now);
                    return;
                }
                errors.add(contact.channel() + ": " + result.error());
            } catch (RuntimeException e) {
                errors.add(contact.channel() + ": " + e.getClass().getSimpleName());
            }
        }
        int attempts = n.attempts() + 1;
        boolean giveUp = attempts >= props.notifications().maxAttempts();
        Duration backoff = props.notifications().retryBackoff().multipliedBy(1L << Math.min(attempts - 1, 10));
        outbox.markFailedAttempt(n.id(), giveUp, now.plus(backoff), String.join("; ", errors));
        LOG.warn("Notification {} for vault {} failed on all channels (attempt {}, giveUp={})", n.id(), n.vaultId(),
                attempts, giveUp);
        if (giveUp) {
            audit.record(n.vaultId(), Actor.system(), "NOTIFICATION_FAILED", Map.of(
                    "kind", n.kind().name(), "recipient", n.recipientKind(), "step", n.stepIndex()), now);
        }
    }
}
