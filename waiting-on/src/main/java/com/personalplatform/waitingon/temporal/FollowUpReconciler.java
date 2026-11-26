package com.personalplatform.waitingon.temporal;

import com.personalplatform.waitingon.item.EventRepository;
import com.personalplatform.waitingon.item.EventType;
import com.personalplatform.waitingon.item.ItemRepository;
import com.personalplatform.waitingon.item.WaitingItem;
import com.personalplatform.waitingon.workflow.FollowUpScheduler;
import com.personalplatform.waitingon.workflow.Stage;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Keeps every active item's follow-up running. Workflows are started when an item is created; if Temporal later
 * loses them (a dev server without persistence restarts, a namespace is recreated), open items would otherwise stop
 * being followed up, silently and forever. At startup and then periodically this restarts any missing workflow,
 * resuming at the stage the item already reached and on its original dates, so nothing is sent twice.
 * Temporal being unreachable is logged and retried on the next run; it never stops the service.
 */
@Component
@EnableScheduling
@ConditionalOnProperty(prefix = "app.temporal", name = "enabled", havingValue = "true", matchIfMissing = true)
public class FollowUpReconciler {

    private static final Logger LOG = LoggerFactory.getLogger(FollowUpReconciler.class);
    private static final int PAGE = 200;

    private final ItemRepository items;
    private final EventRepository events;
    private final FollowUpScheduler scheduler;

    public FollowUpReconciler(ItemRepository items, EventRepository events, FollowUpScheduler scheduler) {
        this.items = items;
        this.events = events;
        this.scheduler = scheduler;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        reconcile();
    }

    @Scheduled(initialDelayString = "${app.temporal.reconcile-interval:PT15M}",
            fixedDelayString = "${app.temporal.reconcile-interval:PT15M}")
    public void periodically() {
        reconcile();
    }

    /** Returns how many workflows were restarted. */
    public int reconcile() {
        int resumed = 0;
        UUID after = null;
        try {
            while (true) {
                List<WaitingItem> page = items.listActive(after, PAGE);
                for (WaitingItem item : page) {
                    if (scheduler.resumeIfMissing(item, stageOf(item))) {
                        resumed++;
                    }
                }
                if (page.size() < PAGE) {
                    break;
                }
                after = page.get(page.size() - 1).id();
            }
        } catch (RuntimeException e) {
            LOG.warn("Follow-up reconciliation stopped early ({} resumed): {}", resumed, e.getMessage());
            return resumed;
        }
        if (resumed > 0) {
            LOG.info("Resumed {} follow-up workflow(s) that Temporal no longer knew", resumed);
        }
        return resumed;
    }

    /** The workflow stage an active item has reached, from its status and timeline. */
    Stage stageOf(WaitingItem item) {
        return switch (item.status()) {
            case NUDGED -> Stage.NUDGED;
            case ESCALATED -> events.timeline(item.id(), item.ownerUid()).stream()
                    .anyMatch(e -> e.type() == EventType.FINAL_NOTICE_DRAFTED) ? Stage.FINAL_NOTICE : Stage.ESCALATED;
            default -> Stage.AWAITING_NUDGE;
        };
    }
}
