package com.personalplatform.askyourlife.ingest;

import com.personalplatform.askyourlife.config.IngestProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Polls the queue. Any number of service instances may run this; SKIP LOCKED keeps them from colliding. */
@Component
@ConditionalOnProperty(prefix = "app.ingest", name = "scheduler-enabled", havingValue = "true", matchIfMissing = true)
public class IngestionScheduler {

    private static final Logger LOG = LoggerFactory.getLogger(IngestionScheduler.class);

    private final IngestionWorker worker;
    private final IngestProperties props;

    public IngestionScheduler(IngestionWorker worker, IngestProperties props) {
        this.worker = worker;
        this.props = props;
    }

    @Scheduled(fixedDelayString = "${app.ingest.poll-interval:2s}")
    void poll() {
        try {
            worker.drain(props.jobsPerPoll());
        } catch (RuntimeException e) {
            LOG.error("Ingestion poll failed", e);
        }
    }
}
