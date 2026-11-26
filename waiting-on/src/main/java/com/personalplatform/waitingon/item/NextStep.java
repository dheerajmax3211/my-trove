package com.personalplatform.waitingon.item;

import com.personalplatform.waitingon.escalation.EscalationPlan;
import com.personalplatform.waitingon.workflow.FollowUpState;
import com.personalplatform.waitingon.workflow.NextAction;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

/**
 * What the follow-up does next for an active item, and when. Every item response carries one so no client has to
 * guess the schedule.
 *
 * <p>{@link Source#WORKFLOW}: read from the running workflow's {@code state()} query, so snoozes, a NEEDS_INFO hold and
 * a refusal that skipped the nudge are all reflected. {@link Source#PLAN}: Temporal did not answer (unreachable,
 * disabled, or the workflow is not known to it), so the step is read off the stored plan, counted from creation; this
 * ignores snoozes and reply holds, which is why the response says which one it is.
 */
public record NextStep(NextAction action, Instant at, Source source) {

    public enum Source {
        WORKFLOW, PLAN
    }

    /** The workflow's answer, or empty when the workflow has nothing further to do. */
    public static Optional<NextStep> fromWorkflow(FollowUpState state) {
        if (state.nextAction() == NextAction.NONE || state.nextActionAtEpochMillis() == null) {
            return Optional.empty();
        }
        return Optional.of(new NextStep(state.nextAction(), Instant.ofEpochMilli(state.nextActionAtEpochMillis()),
                Source.WORKFLOW));
    }

    /**
     * The step the stored plan puts next for the item's status, counted from {@code createdAt}. For an escalated item
     * with a final notice in the plan, the final notice is next until its day has passed, then expiry (the status does
     * not record whether the notice was drafted). Empty for closed items.
     */
    public static Optional<NextStep> fromPlan(WaitingItem item, Instant now) {
        if (item.status().isTerminal()) {
            return Optional.empty();
        }
        EscalationPlan p = item.plan();
        Instant created = item.createdAt().toInstant();
        NextAction action = switch (item.status()) {
            case OPEN -> NextAction.NUDGE;
            case NUDGED -> NextAction.ESCALATE;
            default -> p.hasFinalNotice() && dayOf(created, p.finalNoticeAfterDays()).isAfter(now)
                    ? NextAction.FINAL_NOTICE : NextAction.EXPIRE;
        };
        int days = switch (action) {
            case NUDGE -> p.nudgeAfterDays();
            case ESCALATE -> p.escalateAfterDays();
            case FINAL_NOTICE -> p.finalNoticeAfterDays();
            default -> p.expireAfterDays();
        };
        return Optional.of(new NextStep(action, dayOf(created, days), Source.PLAN));
    }

    /**
     * The next step for an item: the workflow's when it answered, the plan's otherwise. An answering workflow that has
     * nothing further to do wins over the plan (it is about to close the item).
     */
    public static Optional<NextStep> of(WaitingItem item, Optional<FollowUpState> workflow, Instant now) {
        if (item.status().isTerminal()) {
            return Optional.empty();
        }
        return workflow.isPresent() ? fromWorkflow(workflow.get()) : fromPlan(item, now);
    }

    private static Instant dayOf(Instant created, int days) {
        return created.plus(Duration.ofDays(days));
    }
}
