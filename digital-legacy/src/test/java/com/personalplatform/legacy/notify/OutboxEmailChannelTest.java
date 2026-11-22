package com.personalplatform.legacy.notify;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.personalplatform.legacy.protocol.Urgency;
import com.personalplatform.notify.Notification;
import com.personalplatform.notify.NotificationOutbox;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Legacy email goes to the shared outbox as an email-only notification, keyed by the outbox row it delivers. */
class OutboxEmailChannelTest {

    private final NotificationOutbox outbox = mock(NotificationOutbox.class);
    private final OutboxEmailChannel channel = new OutboxEmailChannel(outbox);

    private static NotificationMessage message(UUID messageId) {
        return new NotificationMessage(UUID.randomUUID(), NotificationKind.CHECK_IN_MISSED, Urgency.NOTICE, "OWNER",
                "You missed a check-in", "Open the app and tap check-in.", messageId);
    }

    @Test
    void anEmailBecomesAnEmailOnlyNotificationToTheAddress() {
        when(outbox.enqueue(any())).thenReturn(true);

        var result = channel.send(message(UUID.randomUUID()), "anna@example.com");

        assertThat(result.delivered()).isTrue();
        ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
        verify(outbox).enqueue(captor.capture());
        Notification n = captor.getValue();
        assertThat(n.recipientEmail()).isEqualTo("anna@example.com");
        assertThat(n.recipientUid()).isNull();
        assertThat(n.inApp()).isFalse();
        assertThat(n.kind()).isEqualTo("CHECK_IN_MISSED");
        assertThat(n.source()).isEqualTo("digital-legacy");
        assertThat(n.title()).isEqualTo("You missed a check-in");
    }

    @Test
    void theSameOutboxRowIsNeverQueuedTwice() {
        when(outbox.enqueue(any())).thenReturn(true);
        UUID row = UUID.randomUUID();

        channel.send(message(row), "anna@example.com");
        channel.send(message(row), "anna@example.com");

        ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
        verify(outbox, org.mockito.Mockito.times(2)).enqueue(captor.capture());
        assertThat(captor.getAllValues().get(0).dedupeKey()).isEqualTo(captor.getAllValues().get(1).dedupeKey());
    }
}
