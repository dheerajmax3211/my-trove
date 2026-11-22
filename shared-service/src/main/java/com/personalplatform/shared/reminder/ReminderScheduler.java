package com.personalplatform.shared.reminder;

import com.personalplatform.notify.NotificationRelay;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Polls: fire due reminders into the outbox, then relay the outbox. Safe to run on many instances at once. */
@Component
@ConditionalOnProperty(name = "app.scheduler.enabled", havingValue = "true", matchIfMissing = true)
public class ReminderScheduler {

    private static final Logger LOG = LoggerFactory.getLogger(ReminderScheduler.class);

    private final ReminderEngine engine;
    private final NotificationRelay relay;
    private final SchedulerProperties props;

    public ReminderScheduler(ReminderEngine engine, NotificationRelay relay, SchedulerProperties props) {
        this.engine = engine;
        this.relay = relay;
        this.props = props;
    }

    @Scheduled(fixedDelayString = "${app.scheduler.poll-interval:PT5S}")
    public void tick() {
        try {
            List<UUID> fired;
            do {
                fired = engine.fireDue();
            } while (fired.size() >= props.batchSize());
            relay.dispatchDue(props.batchSize());
        } catch (RuntimeException e) {
            LOG.error("Scheduler tick failed; will retry next interval", e);
        }
    }
}
