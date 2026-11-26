package com.personalplatform.waitingon.workflow;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.waitingon.escalation.EscalationPlan;
import com.personalplatform.waitingon.item.ItemStatus;
import com.personalplatform.waitingon.reply.ReplyOutcome;
import io.temporal.api.enums.v1.EventType;
import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowOptions;
import io.temporal.client.WorkflowStub;
import io.temporal.testing.TestWorkflowEnvironment;
import io.temporal.worker.Worker;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Runs the real workflow code on Temporal's in-process test server with TIME SKIPPING: days of waiting take
 * milliseconds, nothing sleeps, no Temporal server or Docker is needed. Activities are a recording fake; their
 * timestamps are the test server's (virtual) clock.
 */
class FollowUpWorkflowTest {

    private static final long DAY = Duration.ofDays(1).toMillis();
    private static final String QUEUE = "test-follow-up";
    /** nudge day 3, escalate day 10, final notice day 21, expire day 45 */
    private static final EscalationPlan PLAN = new EscalationPlan(3, 10, 21, 45);

    record Call(String name, long atMillis, Object arg) {
    }

    /** Recording fake of the side-effecting activities. */
    static class FakeActivities implements FollowUpActivities {
        final List<Call> calls = new CopyOnWriteArrayList<>();
        final TestWorkflowEnvironment env;
        volatile StepResult nudgeResult = StepResult.DONE;
        volatile boolean nudgeFails;

        FakeActivities(TestWorkflowEnvironment env) {
            this.env = env;
        }

        private void log(String name, Object arg) {
            calls.add(new Call(name, env.currentTimeMillis(), arg));
        }

        @Override
        public StepResult sendNudge(UUID itemId) {
            log("sendNudge", null);
            if (nudgeFails) {
                throw new IllegalStateException("notification provider down");
            }
            return nudgeResult;
        }

        @Override
        public StepResult draftEscalation(UUID itemId) {
            log("draftEscalation", null);
            return StepResult.DONE;
        }

        @Override
        public StepResult sendFinalNotice(UUID itemId) {
            log("sendFinalNotice", null);
            return StepResult.DONE;
        }

        @Override
        public void closeItem(UUID itemId, ItemStatus terminalStatus, String outcome) {
            log("closeItem", terminalStatus + "|" + outcome);
        }

        List<String> names() {
            return calls.stream().map(Call::name).toList();
        }

        Call call(String name) {
            return calls.stream().filter(c -> c.name().equals(name)).findFirst().orElseThrow();
        }
    }

    TestWorkflowEnvironment env;
    WorkflowClient client;
    FakeActivities activities;
    long startedAt;
    UUID itemId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        env = TestWorkflowEnvironment.newInstance();
        Worker worker = env.newWorker(QUEUE);
        worker.registerWorkflowImplementationTypes(FollowUpWorkflowImpl.class);
        activities = new FakeActivities(env);
        worker.registerActivitiesImplementations(activities);
        env.start();
        client = env.getWorkflowClient();
    }

    @AfterEach
    void tearDown() {
        env.close();
    }

    private FollowUpWorkflow start(EscalationPlan plan) {
        FollowUpWorkflow wf = client.newWorkflowStub(FollowUpWorkflow.class, WorkflowOptions.newBuilder()
                .setWorkflowId(FollowUpWorkflow.workflowIdFor(itemId)).setTaskQueue(QUEUE).build());
        startedAt = env.currentTimeMillis();
        WorkflowClient.start(wf::run, new FollowUpInput(itemId, plan));
        return wf;
    }

    private FollowUpResult await(FollowUpWorkflow wf) {
        return WorkflowStub.fromTyped(wf).getResult(FollowUpResult.class); // unlocks time skipping until done
    }

    private void assertAtDay(Call call, int day) {
        long offset = call.atMillis() - startedAt;
        assertThat(offset).as(call.name() + " should run on day " + day)
                .isBetween(day * DAY, day * DAY + Duration.ofSeconds(30).toMillis());
    }

    private long countEvents(EventType type) {
        return client.fetchHistory(FollowUpWorkflow.workflowIdFor(itemId)).getEvents().stream()
                .filter(e -> e.getEventType() == type).count();
    }

    /** Starts a workflow the way FollowUpReconciler restarts a lost one. */
    private FollowUpWorkflow resume(EscalationPlan plan, long anchorMillis, Stage at) {
        FollowUpWorkflow wf = client.newWorkflowStub(FollowUpWorkflow.class, WorkflowOptions.newBuilder()
                .setWorkflowId(FollowUpWorkflow.workflowIdFor(itemId)).setTaskQueue(QUEUE).build());
        startedAt = anchorMillis;
        WorkflowClient.start(wf::run, new FollowUpInput(itemId, plan, anchorMillis, at));
        return wf;
    }

    // ---------------------------------------------------------------- resuming a lost workflow

    @Test
    void aResumedWorkflowSkipsStepsAlreadyTakenAndKeepsTheOriginalDates() {
        // The item was created 5 days ago and already nudged; Temporal lost the workflow.
        FollowUpWorkflow wf = resume(PLAN, env.currentTimeMillis() - 5 * DAY, Stage.NUDGED);
        await(wf);

        assertThat(activities.names()).containsExactly("draftEscalation", "sendFinalNotice", "closeItem");
        assertAtDay(activities.call("draftEscalation"), 10);
        assertAtDay(activities.call("sendFinalNotice"), 21);
        assertAtDay(activities.call("closeItem"), 45);
    }

    @Test
    void aResumedWorkflowRunsOverdueStepsAtOnceInsteadOfWaitingAgain() {
        // Created 12 days ago, never nudged (the workflow was lost before day 3): nudge and escalation are both due.
        long now = env.currentTimeMillis();
        FollowUpWorkflow wf = resume(PLAN, now - 12 * DAY, Stage.AWAITING_NUDGE);
        await(wf);

        assertThat(activities.names()).containsExactly("sendNudge", "draftEscalation", "sendFinalNotice", "closeItem");
        assertThat(activities.call("sendNudge").atMillis() - now).isLessThan(Duration.ofSeconds(30).toMillis());
        assertThat(activities.call("draftEscalation").atMillis() - now).isLessThan(Duration.ofSeconds(30).toMillis());
        assertAtDay(activities.call("sendFinalNotice"), 21);
    }

    @Test
    void aResumedWorkflowPastTheFinalNoticeOnlyWaitsToExpire() {
        FollowUpWorkflow wf = resume(PLAN, env.currentTimeMillis() - 30 * DAY, Stage.FINAL_NOTICE);
        await(wf);

        assertThat(activities.names()).containsExactly("closeItem");
        assertAtDay(activities.call("closeItem"), 45);
    }

    // ---------------------------------------------------------------- the schedule

    @Test
    void nudgesThenEscalatesThenFinalNoticeThenExpires() {
        FollowUpWorkflow wf = start(PLAN);
        FollowUpResult result = await(wf);

        assertThat(activities.names()).containsExactly("sendNudge", "draftEscalation", "sendFinalNotice", "closeItem");
        assertAtDay(activities.call("sendNudge"), 3);
        assertAtDay(activities.call("draftEscalation"), 10);
        assertAtDay(activities.call("sendFinalNotice"), 21);
        assertAtDay(activities.call("closeItem"), 45);
        assertThat(activities.call("closeItem").arg().toString()).startsWith("EXPIRED|No resolution 45 days");
        assertThat(result.finalStage()).isEqualTo(Stage.EXPIRED);
    }

    @Test
    void finalNoticeStageIsOptional() {
        FollowUpWorkflow wf = start(new EscalationPlan(2, 6, 0, 20));
        await(wf);
        assertThat(activities.names()).containsExactly("sendNudge", "draftEscalation", "closeItem");
        assertAtDay(activities.call("closeItem"), 20);
    }

    @Test
    void queryReportsStageAndNextActionTime() {
        FollowUpWorkflow wf = start(PLAN);
        FollowUpState initial = wf.state();
        assertThat(initial.stage()).isEqualTo(Stage.AWAITING_NUDGE);
        assertThat(initial.nextAction()).isEqualTo(NextAction.NUDGE);
        assertThat(initial.nextActionAtEpochMillis()).isBetween(startedAt + 3 * DAY, startedAt + 3 * DAY + 30_000);

        env.sleep(Duration.ofDays(5));
        FollowUpState afterNudge = wf.state();
        assertThat(afterNudge.stage()).isEqualTo(Stage.NUDGED);
        assertThat(afterNudge.nextAction()).isEqualTo(NextAction.ESCALATE);
        assertThat(afterNudge.nextActionAtEpochMillis()).isBetween(startedAt + 10 * DAY, startedAt + 10 * DAY + 30_000);

        env.sleep(Duration.ofDays(6));
        assertThat(wf.state().stage()).isEqualTo(Stage.ESCALATED);
        assertThat(wf.state().nextAction()).isEqualTo(NextAction.FINAL_NOTICE);

        await(wf);
        FollowUpState done = wf.state();
        assertThat(done.stage()).isEqualTo(Stage.EXPIRED);
        assertThat(done.nextAction()).isEqualTo(NextAction.NONE);
        assertThat(done.nextActionAtEpochMillis()).isNull();
    }

    // ---------------------------------------------------------------- resolve / cancel

    @Test
    void resolveMidWaitCancelsPendingTimerAndStoresOutcome() {
        FollowUpWorkflow wf = start(PLAN);
        env.sleep(Duration.ofDays(5)); // nudge done, now waiting for day 10
        assertThat(activities.names()).containsExactly("sendNudge");

        wf.resolve("Refund of 40 EUR received");
        FollowUpResult result = await(wf);

        assertThat(result.finalStage()).isEqualTo(Stage.RESOLVED);
        assertThat(result.outcome()).isEqualTo("Refund of 40 EUR received");
        assertThat(activities.names()).containsExactly("sendNudge", "closeItem");
        assertThat(activities.call("closeItem").arg()).isEqualTo("RESOLVED|Refund of 40 EUR received");
        // the day-10 timer was started and then cancelled by the signal, not left to fire
        assertThat(countEvents(EventType.EVENT_TYPE_TIMER_CANCELED)).isGreaterThanOrEqualTo(1);
        env.sleep(Duration.ofDays(60)); // nothing else happens, ever
        assertThat(activities.names()).containsExactly("sendNudge", "closeItem");
    }

    @Test
    void resolveBeforeFirstNudgeSendsNoMessages() {
        FollowUpWorkflow wf = start(PLAN);
        env.sleep(Duration.ofDays(1));
        wf.resolve("Paid early");
        await(wf);
        assertThat(activities.names()).containsExactly("closeItem");
    }

    @Test
    void blankOutcomeGetsADefault() {
        FollowUpWorkflow wf = start(PLAN);
        wf.resolve("  ");
        assertThat(await(wf).outcome()).isEqualTo("Resolved");
    }

    @Test
    void cancelStopsEverything() {
        FollowUpWorkflow wf = start(PLAN);
        env.sleep(Duration.ofDays(12));
        wf.cancel();
        FollowUpResult result = await(wf);
        assertThat(result.finalStage()).isEqualTo(Stage.CANCELLED);
        assertThat(activities.names()).containsExactly("sendNudge", "draftEscalation", "closeItem");
        assertThat(activities.call("closeItem").arg().toString()).startsWith("CANCELLED|");
    }

    @Test
    void firstTerminalSignalWins() {
        FollowUpWorkflow wf = start(PLAN);
        wf.resolve("done");
        wf.cancel();
        assertThat(await(wf).finalStage()).isEqualTo(Stage.RESOLVED);
    }

    // ---------------------------------------------------------------- snooze

    @Test
    void snoozeShiftsTheWholeRemainingSchedule() {
        FollowUpWorkflow wf = start(PLAN);
        env.sleep(Duration.ofDays(2));
        wf.snooze(5); // nudge 3 -> 8, escalate 10 -> 15, final 21 -> 26, expire 45 -> 50
        assertThat(wf.state().snoozedDays()).isEqualTo(5);
        assertThat(wf.state().nextActionAtEpochMillis()).isBetween(startedAt + 8 * DAY, startedAt + 8 * DAY + 30_000);

        await(wf);
        assertAtDay(activities.call("sendNudge"), 8);
        assertAtDay(activities.call("draftEscalation"), 15);
        assertAtDay(activities.call("sendFinalNotice"), 26);
        assertAtDay(activities.call("closeItem"), 50);
    }

    @Test
    void snoozeAfterTheNudgeOnlyMovesWhatIsLeft() {
        FollowUpWorkflow wf = start(PLAN);
        env.sleep(Duration.ofDays(4)); // nudge sent on day 3
        wf.snooze(10);
        await(wf);
        assertAtDay(activities.call("sendNudge"), 3);
        assertAtDay(activities.call("draftEscalation"), 20);
    }

    @Test
    void snoozesAccumulateAndOutOfRangeSnoozeIsIgnored() {
        FollowUpWorkflow wf = start(PLAN);
        wf.snooze(2);
        wf.snooze(3);
        wf.snooze(0);
        wf.snooze(-4);
        wf.snooze(91);
        assertThat(wf.state().snoozedDays()).isEqualTo(5);
        await(wf);
        assertAtDay(activities.call("sendNudge"), 8);
    }

    // ---------------------------------------------------------------- replies

    @Test
    void paidReplyResolves() {
        FollowUpWorkflow wf = start(PLAN);
        env.sleep(Duration.ofDays(1));
        wf.replyReceived(ReplyOutcome.PAID);
        FollowUpResult result = await(wf);
        assertThat(result.finalStage()).isEqualTo(Stage.RESOLVED);
        assertThat(activities.names()).containsExactly("closeItem");
    }

    @Test
    void rejectedReplySkipsTheNudgeAndEscalatesImmediately() {
        FollowUpWorkflow wf = start(PLAN);
        env.sleep(Duration.ofDays(1));
        wf.replyReceived(ReplyOutcome.REJECTED);
        env.sleep(Duration.ofSeconds(5));
        assertThat(activities.names()).containsExactly("draftEscalation");
        assertThat(activities.call("draftEscalation").atMillis() - startedAt).isLessThan(2 * DAY);
        assertThat(wf.state().stage()).isEqualTo(Stage.ESCALATED);
        // the rest of the plan (final notice, expiry) is unchanged
        await(wf);
        assertAtDay(activities.call("sendFinalNotice"), 21);
        assertAtDay(activities.call("closeItem"), 45);
    }

    @Test
    void rejectedReplyAfterEscalationChangesNothing() {
        FollowUpWorkflow wf = start(PLAN);
        env.sleep(Duration.ofDays(11));
        wf.replyReceived(ReplyOutcome.REJECTED);
        await(wf);
        assertThat(activities.names()).containsExactly("sendNudge", "draftEscalation", "sendFinalNotice", "closeItem");
    }

    @Test
    void needsInfoReplyHoldsTheSchedule() {
        FollowUpWorkflow wf = start(PLAN);
        env.sleep(Duration.ofDays(1));
        wf.replyReceived(ReplyOutcome.NEEDS_INFO);
        assertThat(wf.state().snoozedDays()).isEqualTo(7);
        await(wf);
        assertAtDay(activities.call("sendNudge"), 10);
        assertAtDay(activities.call("draftEscalation"), 17);
    }

    @Test
    void unknownReplyChangesNothing() {
        FollowUpWorkflow wf = start(PLAN);
        wf.replyReceived(ReplyOutcome.UNKNOWN);
        assertThat(wf.state().snoozedDays()).isZero();
        await(wf);
        assertAtDay(activities.call("sendNudge"), 3);
    }

    // ---------------------------------------------------------------- failure handling

    @Test
    void itemClosedElsewhereStopsTheWorkflow() {
        activities.nudgeResult = StepResult.ITEM_CLOSED;
        FollowUpWorkflow wf = start(PLAN);
        FollowUpResult result = await(wf);
        assertThat(result.finalStage()).isEqualTo(Stage.CLOSED_EXTERNALLY);
        assertThat(activities.names()).containsExactly("sendNudge");
    }

    @Test
    void permanentlyFailingNotificationDoesNotWedgeTheSchedule() {
        activities.nudgeFails = true;
        FollowUpWorkflow wf = start(PLAN);
        FollowUpResult result = await(wf);
        // the nudge was retried (8 attempts) and given up on; escalation and expiry still happen
        assertThat(activities.names().stream().filter("sendNudge"::equals).count()).isEqualTo(8);
        assertThat(activities.names()).contains("draftEscalation", "sendFinalNotice", "closeItem");
        assertThat(result.finalStage()).isEqualTo(Stage.EXPIRED);
    }

    @Test
    void workflowIdIsDerivedFromItemId() {
        assertThat(FollowUpWorkflow.workflowIdFor(itemId)).isEqualTo("follow-up-" + itemId);
        start(PLAN);
        assertThat(client.fetchHistory("follow-up-" + itemId).getEvents()).isNotEmpty();
    }
}
