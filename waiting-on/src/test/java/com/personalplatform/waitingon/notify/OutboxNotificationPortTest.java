package com.personalplatform.waitingon.notify;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.personalplatform.notify.Notification;
import com.personalplatform.notify.NotificationOutbox;
import com.personalplatform.waitingon.item.ItemCategory;
import com.personalplatform.waitingon.item.ItemStatus;
import com.personalplatform.waitingon.item.WaitingItem;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** What the port writes to the outbox: counterparties get email, owners get an inbox item and the same email. */
class OutboxNotificationPortTest {

    private final NotificationOutbox outbox = mock(NotificationOutbox.class);
    private final OutboxNotificationPort port = new OutboxNotificationPort(outbox);

    private static WaitingItem item(String counterpartyEmail) {
        return new WaitingItem(UUID.randomUUID(), "owner-1", "Deposit refund", "Ana", counterpartyEmail,
                ItemCategory.REFUND, null, null, null, ItemStatus.OPEN, null, "tok", null, null, null, null, null);
    }

    private Notification captured() {
        ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
        verify(outbox).enqueue(captor.capture());
        return captor.getValue();
    }

    @Test
    void aNudgeGoesByEmailToTheCounterpartyWithTheReplyAddressAndNoInboxItem() {
        when(outbox.enqueue(any())).thenReturn(true);
        WaitingItem item = item("ana@example.test");

        port.sendNudge(item, "Following up on the deposit", "Could you confirm the refund date?", "reply+t@reply.test");

        Notification n = captured();
        assertThat(n.recipientEmail()).isEqualTo("ana@example.test");
        assertThat(n.recipientUid()).isNull();
        assertThat(n.inApp()).isFalse();
        assertThat(n.replyTo()).isEqualTo("reply+t@reply.test");
        assertThat(n.title()).isEqualTo("Following up on the deposit");
        assertThat(n.body()).isEqualTo("Could you confirm the refund date?");
        assertThat(n.kind()).isEqualTo("WAITING_NUDGE");
        assertThat(n.source()).isEqualTo("waiting-on");
    }

    @Test
    void aRetriedNudgeHasTheSameDedupeKey() {
        when(outbox.enqueue(any())).thenReturn(true);
        WaitingItem item = item("ana@example.test");

        port.sendNudge(item, "s", "b", "r");
        port.sendNudge(item, "s", "b", "r");

        ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
        verify(outbox, org.mockito.Mockito.times(2)).enqueue(captor.capture());
        assertThat(captor.getAllValues().get(0).dedupeKey()).isEqualTo(captor.getAllValues().get(1).dedupeKey());
    }

    @Test
    void withoutACounterpartyAddressTheOwnerGetsTheTextToFollowUpThemselves() {
        when(outbox.enqueue(any())).thenReturn(true);

        port.sendNudge(item(null), "Following up", "Please chase the refund.", "reply+t@reply.test");

        Notification n = captured();
        assertThat(n.recipientUid()).isEqualTo("owner-1");
        assertThat(n.inApp()).isTrue();
        assertThat(n.body()).contains("Please chase the refund.");
    }

    @Test
    void ownerMessagesAreInAppAndEmailedToTheOwner() {
        when(outbox.enqueue(any())).thenReturn(true);

        port.notifyOwner("owner-1", "Reply received about \"Deposit refund\" (ACCEPTED)", "The counterparty agreed.");

        Notification n = captured();
        assertThat(n.recipientUid()).isEqualTo("owner-1");
        assertThat(n.inApp()).isTrue();
        assertThat(n.kind()).isEqualTo("WAITING_UPDATE");
        assertThat(n.title()).startsWith("Reply received");
        assertThat(n.link()).isEqualTo("/waiting-on");
    }
}
