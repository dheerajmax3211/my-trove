package com.personalplatform.waitingon.workflow;

import com.personalplatform.waitingon.reply.ReplyOutcome;
import io.temporal.workflow.QueryMethod;
import io.temporal.workflow.SignalMethod;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;
import java.util.UUID;

/** One execution per waiting item; the workflow id is derived from the item id (see {@link #workflowIdFor}). */
@WorkflowInterface
public interface FollowUpWorkflow {

    String DEFAULT_TASK_QUEUE = "waiting-on-follow-up";

    static String workflowIdFor(UUID itemId) {
        return "follow-up-" + itemId;
    }

    @WorkflowMethod
    FollowUpResult run(FollowUpInput input);

    /** The user got what they were waiting for. Cancels pending timers and closes the item as RESOLVED. */
    @SignalMethod
    void resolve(String outcome);

    /** The counterparty answered; see {@link ReplyOutcome} for how each classification changes the schedule. */
    @SignalMethod
    void replyReceived(ReplyOutcome classification);

    /** Postpones every remaining stage by this many days (1..90, otherwise ignored). */
    @SignalMethod
    void snooze(int days);

    /** The user gave up. Cancels pending timers and closes the item as CANCELLED. */
    @SignalMethod
    void cancel();

    @QueryMethod
    FollowUpState state();
}
