package com.personalplatform.waitingon.workflow;

import com.personalplatform.waitingon.item.ItemStatus;
import io.temporal.activity.ActivityInterface;
import java.util.UUID;

/**
 * Side effects of the follow-up workflow. All methods are idempotent so Temporal retries are safe:
 * stage events are keyed (item, stage) in the timeline, and closing an already closed item is a no-op.
 */
@ActivityInterface
public interface FollowUpActivities {

    /** Sends the friendly reminder via the NotificationPort and moves OPEN -> NUDGED. */
    StepResult sendNudge(UUID itemId);

    /** Drafts the firm escalation letter, stores it on the timeline, tells the owner, moves to ESCALATED. */
    StepResult draftEscalation(UUID itemId);

    /** Drafts the final-notice letter (optional stage). */
    StepResult sendFinalNotice(UUID itemId);

    /** Moves the item to a terminal status (RESOLVED / EXPIRED / CANCELLED) unless it already is terminal. */
    void closeItem(UUID itemId, ItemStatus terminalStatus, String outcome);
}
