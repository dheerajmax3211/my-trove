package com.personalplatform.homepulse.eval;

import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.personalplatform.homepulse.config.HomePulseProperties;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Periodic driver. {@link #runOnce()} is the unit tests and the scheduler share; the schedule itself is off in
 * tests ({@code app.evaluation.enabled=false}) so nothing runs behind their back.
 */
@Component
public class EvaluationJob {

    private static final Logger LOG = LoggerFactory.getLogger(EvaluationJob.class);

    public record Summary(int evaluated, int failed) {}

    private final EvaluationService service;
    private final HomePulseProperties props;

    public EvaluationJob(EvaluationService service, HomePulseProperties props) {
        this.service = service;
        this.props = props;
    }

    @Scheduled(fixedDelayString = "${app.evaluation.interval:PT5M}", initialDelayString = "${app.evaluation.interval:PT5M}")
    void scheduled() {
        if (props.evaluation().enabled()) {
            runOnce();
        }
    }

    public Summary runOnce() {
        List<UUID> ids = service.applianceIdsToEvaluate();
        int failed = 0;
        for (UUID id : ids) {
            try {
                service.evaluate(id);
            } catch (RuntimeException e) {
                failed++;
                LOG.error("evaluation of appliance {} failed", id, e);
            }
        }
        return new Summary(ids.size() - failed, failed);
    }
}
