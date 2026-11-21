package com.personalplatform.legacy.scheduler;

import com.personalplatform.legacy.config.LegacyProperties;
import com.personalplatform.legacy.notify.NotificationDispatcher;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Periodic driver. All durable state lives in Postgres ({@code next_action_at}), so a restarted or additional instance
 * simply picks up where the last one stopped; this class holds no state of its own.
 */
@Component
@ConditionalOnProperty(name = "legacy.scheduler.enabled", havingValue = "true", matchIfMissing = true)
public class SwitchScheduler {

    private final SwitchEngine engine;
    private final NotificationDispatcher dispatcher;
    private final LegacyProperties props;

    public SwitchScheduler(SwitchEngine engine, NotificationDispatcher dispatcher, LegacyProperties props) {
        this.engine = engine;
        this.dispatcher = dispatcher;
        this.props = props;
    }

    @Scheduled(fixedDelayString = "${legacy.scheduler.fixed-delay:30s}")
    public void run() {
        engine.tick();
        dispatcher.dispatchPending(props.scheduler().maxPerTick());
    }
}
