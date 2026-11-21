package com.personalplatform.waitingon;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.waitingon.escalation.EscalationPlan;
import com.personalplatform.waitingon.item.ItemStatus;
import com.personalplatform.waitingon.reply.ReplyOutcome;
import com.personalplatform.waitingon.temporal.TemporalClientAutoConfiguration;
import com.personalplatform.waitingon.workflow.FollowUpActivities;
import com.personalplatform.waitingon.workflow.FollowUpInput;
import com.personalplatform.waitingon.workflow.FollowUpResult;
import com.personalplatform.waitingon.workflow.FollowUpState;
import com.personalplatform.waitingon.workflow.FollowUpWorkflow;
import com.personalplatform.waitingon.workflow.FollowUpWorkflowImpl;
import com.personalplatform.waitingon.workflow.NextAction;
import com.personalplatform.waitingon.workflow.Stage;
import com.personalplatform.waitingon.workflow.StepResult;
import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowOptions;
import io.temporal.client.WorkflowStub;
import io.temporal.worker.Worker;
import io.temporal.worker.WorkerFactory;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.utility.DockerImageName;

/**
 * Opt-in (REAL_TEMPORAL=true, needs Docker and the temporalio/temporal image): proves the production wiring
 * (TemporalClientAutoConfiguration, plain SDK, Jackson payloads of our records) against a REAL Temporal dev server,
 * which the time-skipping test server cannot. It does not wait for real days: it starts a workflow, queries it,
 * signals it and checks the result.
 */
@EnabledIfEnvironmentVariable(named = "REAL_TEMPORAL", matches = "true")
class RealTemporalServerTest {

    static class NoopActivities implements FollowUpActivities {
        public StepResult sendNudge(UUID itemId) {
            return StepResult.DONE;
        }

        public StepResult draftEscalation(UUID itemId) {
            return StepResult.DONE;
        }

        public StepResult sendFinalNotice(UUID itemId) {
            return StepResult.DONE;
        }

        public void closeItem(UUID itemId, ItemStatus terminalStatus, String outcome) {
        }
    }

    @Test
    void productionWiringWorksAgainstARealDevServer() {
        try (GenericContainer<?> temporal = new GenericContainer<>(DockerImageName.parse("temporalio/temporal:latest"))
                .withCommand("server", "start-dev", "--ip", "0.0.0.0")
                .withExposedPorts(7233)
                .waitingFor(Wait.forListeningPort()).withStartupTimeout(Duration.ofMinutes(2))) {
            temporal.start();
            String target = temporal.getHost() + ":" + temporal.getMappedPort(7233);

            new ApplicationContextRunner()
                    .withConfiguration(AutoConfigurations.of(TemporalClientAutoConfiguration.class))
                    .withPropertyValues("app.temporal.target=" + target, "app.temporal.connect-timeout=30s")
                    .run(ctx -> {
                        assertThat(ctx).hasNotFailed();
                        WorkflowClient client = ctx.getBean(WorkflowClient.class);
                        WorkerFactory factory = WorkerFactory.newInstance(client);
                        Worker worker = factory.newWorker("real-server-test");
                        worker.registerWorkflowImplementationTypes(FollowUpWorkflowImpl.class);
                        worker.registerActivitiesImplementations(new NoopActivities());
                        factory.start();
                        try {
                            UUID itemId = UUID.randomUUID();
                            FollowUpWorkflow wf = client.newWorkflowStub(FollowUpWorkflow.class,
                                    WorkflowOptions.newBuilder().setTaskQueue("real-server-test")
                                            .setWorkflowId(FollowUpWorkflow.workflowIdFor(itemId)).build());
                            WorkflowClient.start(wf::run, new FollowUpInput(itemId, new EscalationPlan(3, 10, 21, 45)));

                            FollowUpState state = wf.state();
                            assertThat(state.stage()).isEqualTo(Stage.AWAITING_NUDGE);
                            assertThat(state.nextAction()).isEqualTo(NextAction.NUDGE);
                            assertThat(state.nextActionAtEpochMillis()).isGreaterThan(System.currentTimeMillis());

                            wf.snooze(2);
                            wf.replyReceived(ReplyOutcome.UNKNOWN);
                            assertThat(wf.state().snoozedDays()).isEqualTo(2);
                            wf.resolve("done on a real server");
                            FollowUpResult result = WorkflowStub.fromTyped(wf).getResult(FollowUpResult.class);
                            assertThat(result.finalStage()).isEqualTo(Stage.RESOLVED);
                            assertThat(result.outcome()).isEqualTo("done on a real server");
                        } finally {
                            factory.shutdownNow();
                        }
                    });
        }
    }
}
