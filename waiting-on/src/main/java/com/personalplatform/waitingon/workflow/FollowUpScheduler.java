package com.personalplatform.waitingon.workflow;

import com.personalplatform.waitingon.item.WaitingItem;
import com.personalplatform.waitingon.reply.ReplyOutcome;
import java.util.Optional;
import java.util.UUID;

/**
 * The application's view of the durable follow-up engine. The Temporal implementation lives in the
 * {@code temporal} package; a no-op implementation is used when {@code app.temporal.enabled=false}.
 *
 * <p>The database is the source of truth for item state; signals tell the workflow about it. Signalling a workflow
 * that already finished is not an error.
 */
public interface FollowUpScheduler {

    /** Starts the workflow for a new item (idempotent: same workflow id is accepted once). */
    void start(WaitingItem item);

    void resolve(UUID itemId, String outcome);

    void cancel(UUID itemId);

    void snooze(UUID itemId, int days);

    void replyReceived(UUID itemId, ReplyOutcome classification);

    /** Current stage and next action time, if the workflow exists and Temporal answers. */
    Optional<FollowUpState> state(UUID itemId);

    /**
     * Restarts the workflow of an active item that Temporal no longer knows (its history was lost, for example a dev
     * server restarted without persistence), resuming at {@code resumeAt} on the item's original dates. Returns true
     * when a workflow was started. Schedulers without durable workflows do nothing.
     */
    default boolean resumeIfMissing(WaitingItem item, Stage resumeAt) {
        return false;
    }
}
