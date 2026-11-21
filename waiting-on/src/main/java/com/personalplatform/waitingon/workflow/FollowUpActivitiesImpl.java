package com.personalplatform.waitingon.workflow;

import com.personalplatform.waitingon.escalation.Letter;
import com.personalplatform.waitingon.escalation.Tone;
import com.personalplatform.waitingon.item.EventRepository;
import com.personalplatform.waitingon.item.EventType;
import com.personalplatform.waitingon.item.ItemLetters;
import com.personalplatform.waitingon.item.ItemRepository;
import com.personalplatform.waitingon.item.ItemStatus;
import com.personalplatform.waitingon.item.WaitingItem;
import com.personalplatform.waitingon.notify.NotificationPort;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Runs on Temporal worker threads. Order inside each stage activity is "notify, then record": delivery is
 * at-least-once (a crash between the two repeats the message), but the timeline entry and the status change are
 * written exactly once thanks to the (item, dedupe_key) unique constraint and the compare-and-set status update.
 */
@Component
public class FollowUpActivitiesImpl implements FollowUpActivities {

    private final ItemRepository items;
    private final EventRepository events;
    private final ItemLetters letters;
    private final NotificationPort notifications;
    private final TransactionTemplate tx;
    private final Clock clock;

    public FollowUpActivitiesImpl(ItemRepository items, EventRepository events, ItemLetters letters,
            NotificationPort notifications, TransactionTemplate tx, Clock clock) {
        this.items = items;
        this.events = events;
        this.letters = letters;
        this.notifications = notifications;
        this.tx = tx;
        this.clock = clock;
    }

    @Override
    public StepResult sendNudge(UUID itemId) {
        Optional<WaitingItem> found = items.findById(itemId);
        if (found.isEmpty() || found.get().status().isTerminal()) {
            return StepResult.ITEM_CLOSED;
        }
        WaitingItem item = found.get();
        Letter nudge = letters.draft(Tone.NUDGE, item);
        notifications.sendNudge(item, nudge.subject(), nudge.body(), letters.replyAddress(item));
        record(item, EventType.NUDGE_SENT, "Reminder sent to " + item.counterparty(), nudge.body(), "nudge",
                Set.of(ItemStatus.OPEN), ItemStatus.NUDGED);
        return StepResult.DONE;
    }

    @Override
    public StepResult draftEscalation(UUID itemId) {
        return formalLetter(itemId, Tone.ESCALATION, EventType.ESCALATION_DRAFTED, "escalation",
                "Escalation letter drafted", ItemStatus.ESCALATED);
    }

    @Override
    public StepResult sendFinalNotice(UUID itemId) {
        return formalLetter(itemId, Tone.FINAL_NOTICE, EventType.FINAL_NOTICE_DRAFTED, "final-notice",
                "Final notice drafted", ItemStatus.ESCALATED);
    }

    private StepResult formalLetter(UUID itemId, Tone tone, EventType type, String dedupe, String summary,
            ItemStatus to) {
        Optional<WaitingItem> found = items.findById(itemId);
        if (found.isEmpty() || found.get().status().isTerminal()) {
            return StepResult.ITEM_CLOSED;
        }
        WaitingItem item = found.get();
        Letter letter = letters.draft(tone, item);
        notifications.notifyOwner(item.ownerUid(), summary + " for \"" + item.title() + "\"",
                letter.subject() + "\n\n" + letter.body());
        record(item, type, summary + " for " + item.counterparty(), letter.subject() + "\n\n" + letter.body(), dedupe,
                ItemStatus.ACTIVE, to);
        return StepResult.DONE;
    }

    @Override
    public void closeItem(UUID itemId, ItemStatus terminalStatus, String outcome) {
        if (!terminalStatus.isTerminal()) {
            throw new IllegalArgumentException("not a terminal status: " + terminalStatus);
        }
        items.findById(itemId).ifPresent(item -> {
            if (item.status().isTerminal()) {
                return; // user/REST already closed it; nothing to do
            }
            OffsetDateTime now = OffsetDateTime.now(clock);
            Boolean closed = tx.execute(s -> {
                boolean changed = items.transition(itemId, ItemStatus.ACTIVE, terminalStatus, outcome, now);
                if (changed) {
                    events.append(itemId, item.ownerUid(), eventFor(terminalStatus), summaryFor(terminalStatus),
                            outcome, "closed", now);
                }
                return changed;
            });
            if (Boolean.TRUE.equals(closed)) {
                notifications.notifyOwner(item.ownerUid(), summaryFor(terminalStatus) + ": " + item.title(), outcome);
            }
        });
    }

    private void record(WaitingItem item, EventType type, String summary, String detail, String dedupe,
            Set<ItemStatus> from, ItemStatus to) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        tx.executeWithoutResult(s -> {
            events.append(item.id(), item.ownerUid(), type, summary, detail, dedupe, now);
            items.transition(item.id(), from, to, null, now);
        });
    }

    private static EventType eventFor(ItemStatus s) {
        return switch (s) {
            case RESOLVED -> EventType.RESOLVED;
            case EXPIRED -> EventType.EXPIRED;
            default -> EventType.CANCELLED;
        };
    }

    private static String summaryFor(ItemStatus s) {
        return switch (s) {
            case RESOLVED -> "Resolved";
            case EXPIRED -> "Expired without resolution";
            default -> "Cancelled";
        };
    }
}
