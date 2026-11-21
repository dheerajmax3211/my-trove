package com.personalplatform.waitingon.inbound;

import com.personalplatform.waitingon.item.EventRepository;
import com.personalplatform.waitingon.item.EventType;
import com.personalplatform.waitingon.item.ItemRepository;
import com.personalplatform.waitingon.item.WaitingItem;
import com.personalplatform.waitingon.notify.NotificationPort;
import com.personalplatform.waitingon.reply.ReplyClassifier;
import com.personalplatform.waitingon.reply.ReplyOutcome;
import com.personalplatform.waitingon.workflow.FollowUpScheduler;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Maps an inbound email to an item (plus-address token), classifies it, records it on the timeline and signals the
 * workflow. The workflow, not this class, decides what a PAID / REJECTED / NEEDS_INFO reply does to the schedule.
 */
@Service
public class InboundEmailService {

    private static final Logger LOG = LoggerFactory.getLogger(InboundEmailService.class);
    private static final int MAX_BODY_CHARS = 20_000;
    private static final int EXCERPT_CHARS = 2_000;

    public record InboundEmail(String from, String to, String subject, String text, String messageId) {
    }

    /** matched=false: no item for the address (unknown or malformed token). applied=false: item already closed. */
    public record Result(boolean matched, boolean applied, UUID itemId, ReplyOutcome classification) {
    }

    private final ItemRepository items;
    private final EventRepository events;
    private final ReplyClassifier classifier;
    private final FollowUpScheduler scheduler;
    private final NotificationPort notifications;
    private final Clock clock;

    public InboundEmailService(ItemRepository items, EventRepository events, ReplyClassifier classifier,
            FollowUpScheduler scheduler, NotificationPort notifications, Clock clock) {
        this.items = items;
        this.events = events;
        this.classifier = classifier;
        this.scheduler = scheduler;
        this.notifications = notifications;
        this.clock = clock;
    }

    @Transactional
    public Result handle(InboundEmail mail) {
        Optional<String> token = ReplyAddresses.extractToken(mail.to());
        Optional<WaitingItem> found = token.flatMap(items::findByReplyToken);
        if (found.isEmpty()) {
            LOG.info("Inbound email did not match any item");
            return new Result(false, false, null, null);
        }
        WaitingItem item = found.get();
        String body = mail.text() == null ? "" : mail.text().substring(0, Math.min(mail.text().length(), MAX_BODY_CHARS));
        ReplyOutcome outcome = classifier.classify(mail.subject(), body);

        boolean first = events.append(item.id(), item.ownerUid(), EventType.REPLY_RECEIVED,
                "Reply from " + (mail.from() == null ? "counterparty" : mail.from()) + " classified as " + outcome,
                "Subject: " + (mail.subject() == null ? "" : mail.subject()) + "\n\n"
                        + body.substring(0, Math.min(body.length(), EXCERPT_CHARS)),
                dedupeKey(mail), OffsetDateTime.now(clock));
        if (!first) { // provider retry of a message we already processed
            return new Result(true, false, item.id(), outcome);
        }
        if (item.status().isTerminal()) {
            return new Result(true, false, item.id(), outcome);
        }
        notifications.notifyOwner(item.ownerUid(), "Reply received about \"" + item.title() + "\" (" + outcome + ")",
                "Subject: " + mail.subject());
        scheduler.replyReceived(item.id(), outcome); // failure rolls back the event so the provider's retry works
        return new Result(true, true, item.id(), outcome);
    }

    private static String dedupeKey(InboundEmail mail) {
        if (mail.messageId() == null || mail.messageId().isBlank()) {
            return null;
        }
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(mail.messageId().getBytes(StandardCharsets.UTF_8));
            return "reply:" + HexFormat.of().formatHex(d, 0, 16);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
