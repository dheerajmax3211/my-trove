package com.personalplatform.waitingon.item;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.personalplatform.waitingon.escalation.EscalationPlan;
import com.personalplatform.waitingon.item.ItemExceptions.FollowUpUnavailableException;
import com.personalplatform.waitingon.item.ItemService.ItemDetail;
import com.personalplatform.waitingon.item.NextStep.Source;
import com.personalplatform.waitingon.workflow.FollowUpScheduler;
import com.personalplatform.waitingon.workflow.FollowUpState;
import com.personalplatform.waitingon.workflow.NextAction;
import com.personalplatform.waitingon.workflow.Stage;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** How the list and detail pick the next step: workflow when Temporal answers, plan when it does not. */
class ItemServiceNextStepTest {

    private static final OffsetDateTime CREATED = OffsetDateTime.of(2026, 3, 1, 9, 0, 0, 0, ZoneOffset.UTC);
    private static final Clock CLOCK = Clock.fixed(CREATED.toInstant().plus(Duration.ofDays(1)), ZoneOffset.UTC);

    private final ItemRepository items = mock(ItemRepository.class);
    private final FollowUpScheduler scheduler = mock(FollowUpScheduler.class);
    private final ItemLetters letters = mock(ItemLetters.class);
    private final ItemService service = new ItemService(items, mock(EventRepository.class), scheduler, letters, CLOCK);

    private static WaitingItem item(ItemStatus status) {
        return new WaitingItem(UUID.randomUUID(), "uid", "t", "c", null, ItemCategory.REFUND, null, null,
                LocalDate.of(2026, 3, 5), status, null, "tok", "wf", new EscalationPlan(3, 10, 21, 45), CREATED,
                CREATED, null);
    }

    @Test
    void temporalDownMeansOneProbeAndPlanStepsForTheWholePage() {
        List<WaitingItem> page = List.of(item(ItemStatus.OPEN), item(ItemStatus.NUDGED), item(ItemStatus.OPEN));
        when(items.list(eq("uid"), any(), anyInt(), anyInt())).thenReturn(page);
        when(scheduler.state(any())).thenThrow(new FollowUpUnavailableException("down", new RuntimeException()));

        List<ItemDetail> listed = service.list("uid", null, 50, 0);

        verify(scheduler, times(1)).state(any());
        assertThat(listed).allSatisfy(d -> {
            assertThat(d.followUp()).isEmpty();
            assertThat(d.nextStep()).hasValueSatisfying(n -> assertThat(n.source()).isEqualTo(Source.PLAN));
        });
        assertThat(listed.get(1).nextStep().orElseThrow().action()).isEqualTo(NextAction.ESCALATE);
    }

    @Test
    void temporalUpMeansEveryActiveItemIsQueriedAndClosedOnesAreNot() {
        WaitingItem open = item(ItemStatus.OPEN);
        WaitingItem nudged = item(ItemStatus.NUDGED);
        WaitingItem resolved = item(ItemStatus.RESOLVED);
        when(items.list(eq("uid"), any(), anyInt(), anyInt())).thenReturn(List.of(open, resolved, nudged));
        long due = CREATED.toInstant().plus(Duration.ofDays(9)).toEpochMilli();
        when(scheduler.state(any())).thenReturn(
                Optional.of(new FollowUpState(Stage.AWAITING_NUDGE, NextAction.NUDGE, due, 6)));

        List<ItemDetail> listed = service.list("uid", null, 50, 0);

        verify(scheduler).state(open.id());
        verify(scheduler).state(nudged.id());
        verify(scheduler, times(0)).state(resolved.id());
        assertThat(listed.get(0).nextStep()).hasValueSatisfying(n -> {
            assertThat(n.source()).isEqualTo(Source.WORKFLOW);
            assertThat(n.at().toEpochMilli()).isEqualTo(due);
        });
        assertThat(listed.get(1).nextStep()).isEmpty();
        assertThat(listed.get(2).followUp()).isPresent();
    }

    @Test
    void workflowNotKnownToTemporalFallsBackToThePlanForThatItemOnly() {
        WaitingItem known = item(ItemStatus.OPEN);
        WaitingItem lost = item(ItemStatus.OPEN);
        when(items.list(eq("uid"), any(), anyInt(), anyInt())).thenReturn(List.of(known, lost));
        when(scheduler.state(known.id())).thenReturn(Optional.of(new FollowUpState(Stage.AWAITING_NUDGE,
                NextAction.NUDGE, CREATED.toInstant().plus(Duration.ofDays(3)).toEpochMilli(), 0)));
        when(scheduler.state(lost.id())).thenReturn(Optional.empty());

        List<ItemDetail> listed = service.list("uid", null, 50, 0);

        assertThat(listed.get(0).nextStep().orElseThrow().source()).isEqualTo(Source.WORKFLOW);
        assertThat(listed.get(1).nextStep().orElseThrow().source()).isEqualTo(Source.PLAN);
    }
}
