package com.personalplatform.waitingon.temporal;

import com.personalplatform.waitingon.item.WaitingItem;
import com.personalplatform.waitingon.reply.ReplyOutcome;
import com.personalplatform.waitingon.workflow.FollowUpScheduler;
import com.personalplatform.waitingon.workflow.FollowUpState;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Used when {@code app.temporal.enabled=false}: the API works, nothing is followed up automatically. */
public class NoopFollowUpScheduler implements FollowUpScheduler {

    private static final Logger LOG = LoggerFactory.getLogger(NoopFollowUpScheduler.class);

    public NoopFollowUpScheduler() {
        LOG.warn("Temporal is disabled (app.temporal.enabled=false): items will NOT be followed up automatically");
    }

    @Override
    public void start(WaitingItem item) {
    }

    @Override
    public void resolve(UUID itemId, String outcome) {
    }

    @Override
    public void cancel(UUID itemId) {
    }

    @Override
    public void snooze(UUID itemId, int days) {
    }

    @Override
    public void replyReceived(UUID itemId, ReplyOutcome classification) {
    }

    @Override
    public Optional<FollowUpState> state(UUID itemId) {
        return Optional.empty();
    }
}
