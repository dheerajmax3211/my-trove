package com.personalplatform.waitingon.temporal;

import com.personalplatform.waitingon.item.ItemExceptions.FollowUpUnavailableException;
import com.personalplatform.waitingon.item.WaitingItem;
import com.personalplatform.waitingon.reply.ReplyOutcome;
import com.personalplatform.waitingon.workflow.FollowUpInput;
import com.personalplatform.waitingon.workflow.FollowUpScheduler;
import com.personalplatform.waitingon.workflow.Stage;
import com.personalplatform.waitingon.workflow.FollowUpState;
import com.personalplatform.waitingon.workflow.FollowUpWorkflow;
import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowExecutionAlreadyStarted;
import io.temporal.client.WorkflowNotFoundException;
import io.temporal.client.WorkflowOptions;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Talks to Temporal. The workflow id is derived from the item id, so start/signal are idempotent per item. */
public class TemporalFollowUpScheduler implements FollowUpScheduler {

    private static final Logger LOG = LoggerFactory.getLogger(TemporalFollowUpScheduler.class);

    private final WorkflowClient client;
    private final String taskQueue;

    public TemporalFollowUpScheduler(WorkflowClient client, String taskQueue) {
        this.client = client;
        this.taskQueue = taskQueue;
    }

    @Override
    public void start(WaitingItem item) {
        FollowUpWorkflow wf = client.newWorkflowStub(FollowUpWorkflow.class, WorkflowOptions.newBuilder()
                .setWorkflowId(FollowUpWorkflow.workflowIdFor(item.id()))
                .setTaskQueue(taskQueue)
                .build());
        try {
            WorkflowClient.start(wf::run, new FollowUpInput(item.id(), item.plan()));
        } catch (WorkflowExecutionAlreadyStarted e) {
            LOG.info("Workflow for item {} already started", item.id());
        } catch (RuntimeException e) {
            throw new FollowUpUnavailableException("Could not start follow-up workflow", e);
        }
    }

    @Override
    public boolean resumeIfMissing(WaitingItem item, Stage resumeAt) {
        if (state(item.id()).isPresent()) {
            return false; // running, or closed but still known to Temporal
        }
        FollowUpWorkflow wf = client.newWorkflowStub(FollowUpWorkflow.class, WorkflowOptions.newBuilder()
                .setWorkflowId(FollowUpWorkflow.workflowIdFor(item.id()))
                .setTaskQueue(taskQueue)
                .build());
        try {
            WorkflowClient.start(wf::run, new FollowUpInput(item.id(), item.plan(),
                    item.createdAt().toInstant().toEpochMilli(), resumeAt));
            return true;
        } catch (WorkflowExecutionAlreadyStarted e) {
            return false; // another instance resumed it first
        }
    }

    @Override
    public void resolve(UUID itemId, String outcome) {
        signal(itemId, wf -> wf.resolve(outcome));
    }

    @Override
    public void cancel(UUID itemId) {
        signal(itemId, FollowUpWorkflow::cancel);
    }

    @Override
    public void snooze(UUID itemId, int days) {
        signal(itemId, wf -> wf.snooze(days));
    }

    @Override
    public void replyReceived(UUID itemId, ReplyOutcome classification) {
        signal(itemId, wf -> wf.replyReceived(classification));
    }

    @Override
    public Optional<FollowUpState> state(UUID itemId) {
        try {
            return Optional.of(stub(itemId).state());
        } catch (WorkflowNotFoundException e) {
            return Optional.empty();
        } catch (RuntimeException e) {
            throw new FollowUpUnavailableException("Could not query follow-up workflow", e);
        }
    }

    private void signal(UUID itemId, Consumer<FollowUpWorkflow> call) {
        try {
            call.accept(stub(itemId));
        } catch (WorkflowNotFoundException e) {
            LOG.debug("Workflow for item {} is not running (finished or never started); signal dropped", itemId);
        } catch (RuntimeException e) {
            throw new FollowUpUnavailableException("Could not signal follow-up workflow", e);
        }
    }

    private FollowUpWorkflow stub(UUID itemId) {
        return client.newWorkflowStub(FollowUpWorkflow.class, FollowUpWorkflow.workflowIdFor(itemId));
    }
}
