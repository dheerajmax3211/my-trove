package com.personalplatform.waitingon.item;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.waitingon.escalation.EscalationPlan;
import com.personalplatform.waitingon.item.NextStep.Source;
import com.personalplatform.waitingon.workflow.FollowUpState;
import com.personalplatform.waitingon.workflow.NextAction;
import com.personalplatform.waitingon.workflow.Stage;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class NextStepTest {

    private static final OffsetDateTime CREATED = OffsetDateTime.of(2026, 3, 1, 9, 0, 0, 0, ZoneOffset.UTC);
    private static final Instant T0 = CREATED.toInstant();
    private static final EscalationPlan WITH_FINAL = new EscalationPlan(3, 10, 21, 45);
    private static final EscalationPlan NO_FINAL = new EscalationPlan(5, 14, 0, 45);

    private static WaitingItem item(ItemStatus status, EscalationPlan plan) {
        return new WaitingItem(UUID.randomUUID(), "uid", "t", "c", null, ItemCategory.REFUND, null, null,
                LocalDate.of(2026, 3, 5), status, null, "tok", "wf", plan, CREATED, CREATED, null);
    }

    private static Instant day(int n) {
        return T0.plus(Duration.ofDays(n));
    }

    @Test
    void planGivesTheStageAfterTheCurrentStatusCountedFromCreation() {
        assertThat(NextStep.fromPlan(item(ItemStatus.OPEN, WITH_FINAL), day(0)))
                .contains(new NextStep(NextAction.NUDGE, day(3), Source.PLAN));
        assertThat(NextStep.fromPlan(item(ItemStatus.NUDGED, WITH_FINAL), day(4)))
                .contains(new NextStep(NextAction.ESCALATE, day(10), Source.PLAN));
    }

    @Test
    void escalatedItemWaitsForTheFinalNoticeUntilItsDayHasPassed() {
        assertThat(NextStep.fromPlan(item(ItemStatus.ESCALATED, WITH_FINAL), day(11)))
                .contains(new NextStep(NextAction.FINAL_NOTICE, day(21), Source.PLAN));
        assertThat(NextStep.fromPlan(item(ItemStatus.ESCALATED, WITH_FINAL), day(22)))
                .contains(new NextStep(NextAction.EXPIRE, day(45), Source.PLAN));
        assertThat(NextStep.fromPlan(item(ItemStatus.ESCALATED, NO_FINAL), day(15)))
                .contains(new NextStep(NextAction.EXPIRE, day(45), Source.PLAN));
    }

    @Test
    void closedItemsHaveNoNextStep() {
        for (ItemStatus s : ItemStatus.TERMINAL) {
            assertThat(NextStep.fromPlan(item(s, WITH_FINAL), day(1))).isEmpty();
            assertThat(NextStep.of(item(s, WITH_FINAL),
                    Optional.of(new FollowUpState(Stage.NUDGED, NextAction.ESCALATE, day(10).toEpochMilli(), 0)),
                    day(1))).isEmpty();
        }
    }

    @Test
    void workflowAnswerWinsAndCarriesSnoozes() {
        // snoozed 4 days: the workflow says day 7, the plan would say day 3
        FollowUpState snoozed = new FollowUpState(Stage.AWAITING_NUDGE, NextAction.NUDGE, day(7).toEpochMilli(), 4);
        assertThat(NextStep.of(item(ItemStatus.OPEN, WITH_FINAL), Optional.of(snoozed), day(1)))
                .contains(new NextStep(NextAction.NUDGE, day(7), Source.WORKFLOW));
    }

    @Test
    void workflowAnswerReflectsARefusalThatSkippedTheNudge() {
        FollowUpState refused = new FollowUpState(Stage.AWAITING_NUDGE, NextAction.ESCALATE, day(1).toEpochMilli(), 0);
        assertThat(NextStep.of(item(ItemStatus.OPEN, WITH_FINAL), Optional.of(refused), day(1)))
                .contains(new NextStep(NextAction.ESCALATE, day(1), Source.WORKFLOW));
    }

    @Test
    void fallsBackToThePlanWhenTheWorkflowDidNotAnswer() {
        assertThat(NextStep.of(item(ItemStatus.OPEN, WITH_FINAL), Optional.empty(), day(1)))
                .contains(new NextStep(NextAction.NUDGE, day(3), Source.PLAN));
    }

    @Test
    void finishedWorkflowMeansNoNextStep() {
        FollowUpState done = new FollowUpState(Stage.EXPIRED, NextAction.NONE, null, 0);
        assertThat(NextStep.of(item(ItemStatus.ESCALATED, WITH_FINAL), Optional.of(done), day(50))).isEmpty();
    }
}
