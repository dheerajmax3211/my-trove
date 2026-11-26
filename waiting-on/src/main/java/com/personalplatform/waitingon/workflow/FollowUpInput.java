package com.personalplatform.waitingon.workflow;

import com.personalplatform.waitingon.escalation.EscalationPlan;
import java.util.UUID;

/**
 * @param anchorMillis when the schedule started (the item's creation). Null for a new item: the workflow's own start.
 *                     Set when a lost workflow is restarted, so the remaining steps keep their original dates.
 * @param resumeAt     the stage the item already reached. Null for a new item. Steps before it are skipped, so a
 *                     restarted workflow never sends a nudge or drafts a letter twice.
 */
public record FollowUpInput(UUID itemId, EscalationPlan plan, Long anchorMillis, Stage resumeAt) {

    public FollowUpInput(UUID itemId, EscalationPlan plan) {
        this(itemId, plan, null, null);
    }
}
