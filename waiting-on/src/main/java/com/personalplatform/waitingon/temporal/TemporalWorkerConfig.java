package com.personalplatform.waitingon.temporal;

import com.personalplatform.waitingon.workflow.FollowUpActivitiesImpl;
import com.personalplatform.waitingon.workflow.FollowUpScheduler;
import com.personalplatform.waitingon.workflow.FollowUpWorkflowImpl;
import io.temporal.client.WorkflowClient;
import io.temporal.worker.Worker;
import io.temporal.worker.WorkerFactory;
import java.util.concurrent.TimeUnit;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.SmartLifecycle;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** In-process worker for the follow-up workflow and its activities, plus the scheduler used by the services. */
@Configuration
@ConditionalOnProperty(prefix = "app.temporal", name = "enabled", havingValue = "true", matchIfMissing = true)
class TemporalWorkerConfig {

    @Bean(destroyMethod = "") // stopped by the lifecycle bean below
    WorkerFactory followUpWorkerFactory(WorkflowClient client, TemporalProperties props,
            FollowUpActivitiesImpl activities) {
        WorkerFactory factory = WorkerFactory.newInstance(client);
        Worker worker = factory.newWorker(props.taskQueue());
        worker.registerWorkflowImplementationTypes(FollowUpWorkflowImpl.class);
        worker.registerActivitiesImplementations(activities);
        return factory;
    }

    @Bean
    SmartLifecycle followUpWorkerLifecycle(WorkerFactory factory) {
        return new SmartLifecycle() {
            private volatile boolean running;

            @Override
            public void start() {
                factory.start();
                running = true;
            }

            @Override
            public void stop() {
                factory.shutdown();
                factory.awaitTermination(10, TimeUnit.SECONDS);
                running = false;
            }

            @Override
            public boolean isRunning() {
                return running;
            }

            @Override
            public int getPhase() {
                return Integer.MAX_VALUE - 100; // start late, stop early: after the web layer is ready
            }
        };
    }

    @Bean
    FollowUpScheduler temporalFollowUpScheduler(WorkflowClient client, TemporalProperties props) {
        return new TemporalFollowUpScheduler(client, props.taskQueue());
    }
}
