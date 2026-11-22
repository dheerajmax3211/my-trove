package com.personalplatform.waitingon.item;

import com.personalplatform.sql.UuidV7;
import com.personalplatform.waitingon.common.Plurals;
import com.personalplatform.waitingon.escalation.EscalationPlan;
import com.personalplatform.waitingon.escalation.Letter;
import com.personalplatform.waitingon.escalation.Tone;
import com.personalplatform.waitingon.inbound.ReplyAddresses;
import com.personalplatform.waitingon.item.ItemExceptions.FollowUpUnavailableException;
import com.personalplatform.waitingon.item.ItemExceptions.InvalidStateException;
import com.personalplatform.waitingon.item.ItemExceptions.ItemNotFoundException;
import com.personalplatform.waitingon.workflow.FollowUpScheduler;
import com.personalplatform.waitingon.workflow.FollowUpState;
import com.personalplatform.waitingon.workflow.FollowUpWorkflow;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * User-facing operations. Every method takes the caller's uid and only ever touches that user's rows.
 *
 * <p>Consistency rule: the database is the source of truth. User actions (resolve, cancel) are written to Postgres
 * first and the workflow is signalled afterwards on a best-effort basis; if the signal is lost the workflow notices
 * at its next activity (which reads the item and stops when it is already closed). Creating and snoozing need the
 * workflow, so a scheduler failure rolls the transaction back and the caller gets a 503.
 */
@Service
public class ItemService {

    private static final Logger LOG = LoggerFactory.getLogger(ItemService.class);
    private static final DateTimeFormatter TIMELINE_DATE = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH);

    private final ItemRepository items;
    private final EventRepository events;
    private final FollowUpScheduler scheduler;
    private final ItemLetters letters;
    private final Clock clock;

    public ItemService(ItemRepository items, EventRepository events, FollowUpScheduler scheduler, ItemLetters letters,
            Clock clock) {
        this.items = items;
        this.events = events;
        this.scheduler = scheduler;
        this.letters = letters;
        this.clock = clock;
    }

    public record NewItem(String title, String counterparty, String counterpartyEmail, ItemCategory category,
            java.math.BigDecimal amount, String currency, LocalDate expectedBy, EscalationPlan plan) {
    }

    public record ItemDetail(WaitingItem item, String replyAddress, Optional<FollowUpState> followUp) {
    }

    @Transactional
    public WaitingItem create(String ownerUid, NewItem n) {
        if (n.amount() != null && n.currency() == null) {
            throw new IllegalArgumentException("currency is required when amount is given");
        }
        OffsetDateTime now = OffsetDateTime.now(clock);
        long daysUntil = ChronoUnit.DAYS.between(LocalDate.now(clock), n.expectedBy());
        EscalationPlan plan = n.plan() != null ? n.plan() : EscalationPlan.defaultFor(n.category(), daysUntil);
        UUID id = UuidV7.next();
        WaitingItem item = new WaitingItem(id, ownerUid, n.title().strip(), n.counterparty().strip(),
                n.counterpartyEmail(), n.category(), n.amount(), n.currency(), n.expectedBy(), ItemStatus.OPEN, null,
                ReplyAddresses.newToken(), FollowUpWorkflow.workflowIdFor(id), plan, now, now, null);
        items.insert(item);
        events.append(id, ownerUid, EventType.CREATED,
                "Now waiting on " + item.counterparty() + " for: " + item.title(),
                "Expected by " + TIMELINE_DATE.format(item.expectedBy()) + ". Nudge after day " + plan.nudgeAfterDays() + ", escalate after day "
                        + plan.escalateAfterDays() + (plan.hasFinalNotice()
                                ? ", final notice after day " + plan.finalNoticeAfterDays() : "")
                        + ", expire after day " + plan.expireAfterDays() + ".",
                null, now);
        scheduler.start(item); // failure rolls back the insert
        return item;
    }

    public List<WaitingItem> list(String ownerUid, Set<ItemStatus> statuses, int limit, int offset) {
        return items.list(ownerUid, statuses, Math.min(Math.max(limit, 1), 100), Math.max(offset, 0));
    }

    public ItemDetail get(String ownerUid, UUID id) {
        WaitingItem item = require(ownerUid, id);
        Optional<FollowUpState> state = item.status().isTerminal() ? Optional.empty() : safeState(id);
        return new ItemDetail(item, letters.replyAddress(item), state);
    }

    @Transactional
    public WaitingItem resolve(String ownerUid, UUID id, String outcome) {
        return close(ownerUid, id, ItemStatus.RESOLVED, EventType.RESOLVED,
                outcome == null || outcome.isBlank() ? "Resolved" : outcome.strip());
    }

    @Transactional
    public WaitingItem cancel(String ownerUid, UUID id) {
        return close(ownerUid, id, ItemStatus.CANCELLED, EventType.CANCELLED, "Cancelled by owner");
    }

    private WaitingItem close(String ownerUid, UUID id, ItemStatus to, EventType type, String outcome) {
        WaitingItem item = require(ownerUid, id);
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (!items.transition(id, ItemStatus.ACTIVE, to, outcome, now)) {
            throw new InvalidStateException("Item is already " + item.status());
        }
        events.append(id, ownerUid, type, to == ItemStatus.RESOLVED ? "Marked as resolved" : "Tracking cancelled",
                outcome, "closed", now);
        try {
            if (to == ItemStatus.RESOLVED) {
                scheduler.resolve(id, outcome);
            } else {
                scheduler.cancel(id);
            }
        } catch (FollowUpUnavailableException e) {
            LOG.warn("Item {} closed in the database but the workflow could not be signalled; it will stop itself at "
                    + "its next step: {}", id, e.getMessage());
        }
        return require(ownerUid, id);
    }

    @Transactional
    public ItemDetail snooze(String ownerUid, UUID id, int days) {
        WaitingItem item = require(ownerUid, id);
        if (item.status().isTerminal()) {
            throw new InvalidStateException("Item is already " + item.status());
        }
        OffsetDateTime now = OffsetDateTime.now(clock);
        events.append(id, ownerUid, EventType.SNOOZED, "Follow-ups postponed by " + Plurals.days(days), null, null, now);
        items.touch(id, now);
        scheduler.snooze(id, days); // failure rolls back the event
        return new ItemDetail(require(ownerUid, id), letters.replyAddress(item), safeState(id));
    }

    public List<TimelineEvent> timeline(String ownerUid, UUID id) {
        require(ownerUid, id);
        return events.timeline(id, ownerUid);
    }

    public Letter draft(String ownerUid, UUID id, Tone tone) {
        return letters.draft(tone, require(ownerUid, id));
    }

    private WaitingItem require(String ownerUid, UUID id) {
        return items.findByIdAndOwner(id, ownerUid).orElseThrow(ItemNotFoundException::new);
    }

    private Optional<FollowUpState> safeState(UUID id) {
        try {
            return scheduler.state(id);
        } catch (RuntimeException e) {
            LOG.debug("Could not query follow-up state for {}: {}", id, e.toString());
            return Optional.empty();
        }
    }
}
