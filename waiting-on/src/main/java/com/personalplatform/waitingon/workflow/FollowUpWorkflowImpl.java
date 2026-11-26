package com.personalplatform.waitingon.workflow;

import com.personalplatform.waitingon.escalation.EscalationPlan;
import com.personalplatform.waitingon.item.ItemStatus;
import com.personalplatform.waitingon.reply.ReplyOutcome;
import io.temporal.activity.ActivityOptions;
import io.temporal.common.RetryOptions;
import io.temporal.failure.ActivityFailure;
import io.temporal.workflow.Workflow;
import java.time.Duration;
import java.util.UUID;
import java.util.function.Function;
import org.slf4j.Logger;

/**
 * Deterministic: the only time source is {@link Workflow#currentTimeMillis()}, the only waiting primitive is
 * {@link Workflow#await}, and every side effect is an activity. No random numbers, no system clock, no threads.
 *
 * <p>Schedule model: stage N is due at {@code start + planDays(N) + shiftDays}. {@code shiftDays} grows with
 * {@code snooze(days)} and with a NEEDS_INFO reply. Each wait is one {@code Workflow.await(remaining, condition)}
 * (one Temporal timer) which is cancelled automatically when a signal makes the condition true, so resolve /
 * cancel / snooze never leave a stale timer behind.
 *
 * <p>Versioning note: changing the order or number of stages for already-running executions requires
 * {@code Workflow.getVersion(...)}; workflows run for weeks, so treat this class like a database migration.
 */
public class FollowUpWorkflowImpl implements FollowUpWorkflow {

    static final int NEEDS_INFO_HOLD_DAYS = 7;
    static final int MAX_SNOOZE_DAYS = 90;
    private static final long DAY_MILLIS = Duration.ofDays(1).toMillis();

    private static final Logger LOG = Workflow.getLogger(FollowUpWorkflowImpl.class);

    private final FollowUpActivities activities = Workflow.newActivityStub(FollowUpActivities.class,
            ActivityOptions.newBuilder()
                    .setStartToCloseTimeout(Duration.ofMinutes(2))
                    .setRetryOptions(RetryOptions.newBuilder()
                            .setInitialInterval(Duration.ofSeconds(2))
                            .setBackoffCoefficient(2.0)
                            .setMaximumInterval(Duration.ofMinutes(5))
                            .setMaximumAttempts(8)
                            .build())
                    .build());

    // --- state mutated by signals and read by the query (all single-threaded, workflow-managed) ---
    private Stage stage = Stage.AWAITING_NUDGE;
    private NextAction nextAction = NextAction.NUDGE;
    private Long nextActionAt;
    private int shiftDays;
    private int scheduleVersion;
    private boolean escalateNow;
    private boolean closed;
    private ItemStatus closeStatus;
    private String closeOutcome;
    private long startMillis;

    @Override
    public FollowUpResult run(FollowUpInput input) {
        UUID itemId = input.itemId();
        EscalationPlan plan = input.plan();
        // A restarted workflow (see FollowUpReconciler) keeps the item's original dates and skips what already ran.
        startMillis = input.anchorMillis() != null ? input.anchorMillis() : Workflow.currentTimeMillis();
        Stage resumeAt = input.resumeAt() != null ? input.resumeAt() : Stage.AWAITING_NUDGE;
        stage = resumeAt;

        if (resumeAt.ordinal() < Stage.NUDGED.ordinal()) {
            if (!waitFor(NextAction.NUDGE, plan.nudgeAfterDays(), true)) {
                return finish(itemId);
            }
            if (!escalateNow) { // a refusal skips the friendly reminder
                if (runStep(activities::sendNudge, itemId) == StepResult.ITEM_CLOSED) {
                    return externallyClosed();
                }
                stage = Stage.NUDGED;
            }
        }

        if (resumeAt.ordinal() < Stage.ESCALATED.ordinal()) {
            if (!waitFor(NextAction.ESCALATE, plan.escalateAfterDays(), true)) {
                return finish(itemId);
            }
            if (runStep(activities::draftEscalation, itemId) == StepResult.ITEM_CLOSED) {
                return externallyClosed();
            }
            stage = Stage.ESCALATED;
        }

        if (plan.hasFinalNotice() && resumeAt.ordinal() < Stage.FINAL_NOTICE.ordinal()) {
            if (!waitFor(NextAction.FINAL_NOTICE, plan.finalNoticeAfterDays(), false)) {
                return finish(itemId);
            }
            if (runStep(activities::sendFinalNotice, itemId) == StepResult.ITEM_CLOSED) {
                return externallyClosed();
            }
            stage = Stage.FINAL_NOTICE;
        }

        if (!waitFor(NextAction.EXPIRE, plan.expireAfterDays(), false)) {
            return finish(itemId);
        }
        String outcome = "No resolution " + plan.expireAfterDays() + " days after tracking started";
        activities.closeItem(itemId, ItemStatus.EXPIRED, outcome);
        stage = Stage.EXPIRED;
        clearNext();
        return new FollowUpResult(Stage.EXPIRED, outcome);
    }

    /**
     * Waits until the stage is due. Returns true when the stage should run, false when the workflow was closed by a
     * signal. Re-evaluates after every schedule change, so a snooze simply moves the due time.
     */
    private boolean waitFor(NextAction action, int offsetDays, boolean skippableByRefusal) {
        nextAction = action;
        while (true) {
            if (closed) {
                return false;
            }
            if (skippableByRefusal && escalateNow) {
                nextActionAt = Workflow.currentTimeMillis();
                return true;
            }
            long due = startMillis + (offsetDays + (long) shiftDays) * DAY_MILLIS;
            nextActionAt = due;
            long remaining = due - Workflow.currentTimeMillis();
            if (remaining <= 0) {
                return true;
            }
            int seenVersion = scheduleVersion;
            Workflow.await(Duration.ofMillis(remaining),
                    () -> closed || scheduleVersion != seenVersion || (skippableByRefusal && escalateNow));
        }
    }

    private StepResult runStep(Function<UUID, StepResult> step, UUID itemId) {
        try {
            return step.apply(itemId);
        } catch (ActivityFailure e) {
            // Retries exhausted (e.g. notification provider down for a long time). Do not wedge a weeks-long
            // workflow on one failed message: log and carry on with the schedule.
            LOG.warn("Activity failed permanently for item {}, continuing: {}", itemId, e.getMessage());
            return StepResult.DONE;
        }
    }

    private FollowUpResult finish(UUID itemId) {
        activities.closeItem(itemId, closeStatus, closeOutcome);
        stage = switch (closeStatus) {
            case RESOLVED -> Stage.RESOLVED;
            case CANCELLED -> Stage.CANCELLED;
            default -> Stage.EXPIRED;
        };
        clearNext();
        return new FollowUpResult(stage, closeOutcome);
    }

    private FollowUpResult externallyClosed() {
        stage = Stage.CLOSED_EXTERNALLY;
        clearNext();
        return new FollowUpResult(stage, "Item was closed outside the workflow");
    }

    private void clearNext() {
        nextAction = NextAction.NONE;
        nextActionAt = null;
    }

    @Override
    public void resolve(String outcome) {
        close(ItemStatus.RESOLVED, outcome == null || outcome.isBlank() ? "Resolved" : outcome);
    }

    @Override
    public void cancel() {
        close(ItemStatus.CANCELLED, "Cancelled by owner");
    }

    private void close(ItemStatus status, String outcome) {
        if (!closed) { // first terminal signal wins
            closed = true;
            closeStatus = status;
            closeOutcome = outcome;
        }
    }

    @Override
    public void snooze(int days) {
        if (days < 1 || days > MAX_SNOOZE_DAYS) {
            LOG.warn("Ignoring snooze of {} days (allowed 1..{})", days, MAX_SNOOZE_DAYS);
            return;
        }
        shiftSchedule(days);
    }

    @Override
    public void replyReceived(ReplyOutcome classification) {
        if (classification == null || closed) {
            return;
        }
        switch (classification) {
            case PAID -> close(ItemStatus.RESOLVED, "Counterparty reply indicates it was paid / approved");
            case REJECTED -> {
                if (stage == Stage.AWAITING_NUDGE || stage == Stage.NUDGED) {
                    escalateNow = true;
                    scheduleVersion++;
                }
            }
            case NEEDS_INFO -> shiftSchedule(NEEDS_INFO_HOLD_DAYS);
            case UNKNOWN -> {
                // recorded on the timeline by the webhook; the schedule is unchanged
            }
        }
    }

    private void shiftSchedule(int days) {
        shiftDays += days;
        scheduleVersion++;
    }

    @Override
    public FollowUpState state() {
        return new FollowUpState(stage, nextAction, nextActionAt, shiftDays);
    }
}
