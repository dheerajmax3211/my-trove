package com.personalplatform.waitingon.temporal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.personalplatform.waitingon.escalation.EscalationPlan;
import com.personalplatform.waitingon.item.EventRepository;
import com.personalplatform.waitingon.item.ItemExceptions.FollowUpUnavailableException;
import com.personalplatform.waitingon.item.EventType;
import com.personalplatform.waitingon.item.ItemCategory;
import com.personalplatform.waitingon.item.ItemRepository;
import com.personalplatform.waitingon.item.ItemStatus;
import com.personalplatform.waitingon.item.TimelineEvent;
import com.personalplatform.waitingon.item.WaitingItem;
import com.personalplatform.waitingon.workflow.FollowUpScheduler;
import com.personalplatform.waitingon.workflow.Stage;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** No Docker, no Temporal: the reconciler's choices against fakes. */
class FollowUpReconcilerTest {

    private final ItemRepository items = mock(ItemRepository.class);
    private final EventRepository events = mock(EventRepository.class);
    private final FollowUpScheduler scheduler = mock(FollowUpScheduler.class);
    private final FollowUpReconciler reconciler = new FollowUpReconciler(items, events, scheduler);

    private static WaitingItem item(ItemStatus status) {
        return new WaitingItem(UUID.randomUUID(), "owner", "Refund", "Shop", null, ItemCategory.values()[0], null, null,
                LocalDate.now(), status, null, "token", null, new EscalationPlan(3, 10, 21, 45),
                OffsetDateTime.now().minusDays(4), OffsetDateTime.now(), null);
    }

    @Test
    void resumesEachActiveItemAtTheStageItReached() {
        WaitingItem open = item(ItemStatus.OPEN);
        WaitingItem nudged = item(ItemStatus.NUDGED);
        WaitingItem escalated = item(ItemStatus.ESCALATED);
        WaitingItem noticed = item(ItemStatus.ESCALATED);
        when(items.listActive(null, 200)).thenReturn(List.of(open, nudged, escalated, noticed));
        when(events.timeline(escalated.id(), "owner")).thenReturn(List.of());
        when(events.timeline(noticed.id(), "owner")).thenReturn(List.of(new TimelineEvent(UUID.randomUUID(),
                noticed.id(), EventType.FINAL_NOTICE_DRAFTED, "s", null, OffsetDateTime.now())));
        when(scheduler.resumeIfMissing(any(), any())).thenReturn(true);

        assertThat(reconciler.reconcile()).isEqualTo(4);
        verify(scheduler).resumeIfMissing(open, Stage.AWAITING_NUDGE);
        verify(scheduler).resumeIfMissing(nudged, Stage.NUDGED);
        verify(scheduler).resumeIfMissing(escalated, Stage.ESCALATED);
        verify(scheduler).resumeIfMissing(noticed, Stage.FINAL_NOTICE);
    }

    @Test
    void countsOnlyWorkflowsThatWereActuallyMissing() {
        WaitingItem running = item(ItemStatus.OPEN);
        when(items.listActive(null, 200)).thenReturn(List.of(running));
        when(scheduler.resumeIfMissing(eq(running), any())).thenReturn(false);
        assertThat(reconciler.reconcile()).isZero();
    }

    @Test
    void anUnreachableTemporalNeverThrowsOutOfTheReconciler() {
        when(items.listActive(null, 200)).thenReturn(List.of(item(ItemStatus.OPEN)));
        when(scheduler.resumeIfMissing(any(), any())).thenThrow(new FollowUpUnavailableException("down", null));
        assertThat(reconciler.reconcile()).isZero();
    }

    @Test
    void walksEveryPage() {
        List<WaitingItem> first = java.util.stream.IntStream.range(0, 200).mapToObj(i -> item(ItemStatus.OPEN)).toList();
        WaitingItem last = item(ItemStatus.OPEN);
        when(items.listActive(null, 200)).thenReturn(first);
        when(items.listActive(first.get(199).id(), 200)).thenReturn(List.of(last));
        when(scheduler.resumeIfMissing(any(), any())).thenReturn(true);
        assertThat(reconciler.reconcile()).isEqualTo(201);
        verify(scheduler, never()).resumeIfMissing(eq(null), any());
    }
}
