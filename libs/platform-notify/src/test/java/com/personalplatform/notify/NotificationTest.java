package com.personalplatform.notify;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class NotificationTest {

    @Test
    void dedupeKeysAreStableForTheSameParts() {
        assertThat(Notification.dedupeKey("reminder", "r1", "2026-01-15T10:00Z", "u1"))
                .isEqualTo(Notification.dedupeKey("reminder", "r1", "2026-01-15T10:00Z", "u1"));
        assertThat(Notification.dedupeKey("reminder", "r1", "a", "u1"))
                .isNotEqualTo(Notification.dedupeKey("reminder", "r1", "b", "u1"));
    }

    @Test
    void partBoundariesCannotCollide() {
        // "ab|c" and "a|bc" must not produce the same key
        assertThat(Notification.dedupeKey("ab", "c")).isNotEqualTo(Notification.dedupeKey("a", "bc"));
    }

    @Test
    void userNotificationsAreInAppAndAddressNotificationsAreEmailOnly() {
        Notification user = Notification.toUser("u1", "CONSENT_REQUEST", "consent", "Request", "body", "/consent", "k1");
        assertThat(user.inApp()).isTrue();
        assertThat(user.recipientEmail()).isNull();

        Notification address = Notification.toAddress("trustee@example.test", "TRUSTEE_INVITE", "digital-legacy",
                "Invitation", "body", null, "k2");
        assertThat(address.inApp()).isFalse();
        assertThat(address.recipientUid()).isNull();
    }

    @Test
    void aNotificationNeedsAWhoAndAWhat() {
        assertThatThrownBy(() -> new Notification(null, null, "K", "s", "t", null, null, null, false, "k"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Notification.toUser("u1", "K", "s", " ", null, null, "k"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Notification.toUser("u1", "K", "s", "t", null, null, ""))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new Notification(null, "x@example.test", "K", "s", "t", null, null, null, true, "k"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
