package com.personalplatform.shared;

import static com.personalplatform.sql.jooq.shared.shared.Tables.NOTIFICATIONS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.personalplatform.notify.ContactDirectory;
import com.personalplatform.notify.Notification;
import com.personalplatform.notify.NotificationOutbox;
import com.personalplatform.notify.NotificationRelay;
import com.personalplatform.shared.reminder.ReminderEngine;
import com.personalplatform.shared.reminder.ReminderService;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

/** The inbox API, the email relay and the outbox guarantees, against real Postgres. */
class InboxTests extends AbstractIntegrationTest {

    @Autowired ReminderService reminders;
    @Autowired NotificationOutbox outbox;
    @Autowired ContactDirectory contacts;
    @Autowired NotificationRelay relay;

    private void fireReminderFor(String uid, String title) {
        reminders.create(uid, title, TestBeans.T0, null, null);
        clock.advance(Duration.ofMinutes(1));
        new ReminderEngine(dsl, new TransactionTemplate(txManager), clock, 10).fireDue();
    }

    private static String tokenWithEmail(String uid, String email) {
        return "Bearer " + Base64.getUrlEncoder().withoutPadding()
                .encodeToString((uid + "|" + email).getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void aFiredReminderLandsInTheInboxWithAnUnreadCountThatClearsWhenRead() throws Exception {
        String alice = uid("alice");
        contacts.remember(alice, alice + "@example.test");
        fireReminderFor(alice, "bins");
        relay.dispatchDue(10);

        getAs(alice, "/v1/notifications/unread-count").andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(1));
        String id = read(getAs(alice, "/v1/notifications"), "$[0].id");
        postAs(alice, "/v1/notifications/" + id + "/read", "").andExpect(status().isOk());
        getAs(alice, "/v1/notifications/unread-count").andExpect(jsonPath("$.count").value(0));
        getAs(alice, "/v1/notifications").andExpect(jsonPath("$[0].readAt").isNotEmpty());
    }

    @Test
    void recipientsCannotSeeOrMarkEachOthersNotifications() throws Exception {
        String alice = uid("alice"), bob = uid("bob");
        contacts.remember(alice, alice + "@example.test");
        fireReminderFor(alice, "private");
        relay.dispatchDue(10);
        String aliceNotification = read(getAs(alice, "/v1/notifications"), "$[0].id");

        getAs(bob, "/v1/notifications").andExpect(jsonPath("$", org.hamcrest.Matchers.empty()));
        getAs(bob, "/v1/notifications/unread-count").andExpect(jsonPath("$.count").value(0));
        postAs(bob, "/v1/notifications/" + aliceNotification + "/read", "").andExpect(status().isNotFound());
        getAs(alice, "/v1/notifications/unread-count").andExpect(jsonPath("$.count").value(1));
    }

    @Test
    void readAllMarksEverythingUnreadForTheCallerOnly() throws Exception {
        String alice = uid("alice");
        contacts.remember(alice, alice + "@example.test");
        fireReminderFor(alice, "one");
        fireReminderFor(alice, "two");
        relay.dispatchDue(10);
        getAs(alice, "/v1/notifications/unread-count").andExpect(jsonPath("$.count").value(2));
        postAs(alice, "/v1/notifications/read-all", "").andExpect(status().isOk());
        getAs(alice, "/v1/notifications/unread-count").andExpect(jsonPath("$.count").value(0));
    }

    @Test
    void theRelayEmailsTheAddressOnFileAndTheAddressInTheTokenIsRemembered() throws Exception {
        String alice = uid("alice");
        getWithToken(tokenWithEmail(alice, "alice@example.test"), "/v1/notifications")
                .andExpect(status().isOk());
        assertThat(contacts.emailFor(alice)).contains("alice@example.test");

        outbox.enqueue(Notification.toUser(alice, "CONSENT_REQUEST", "consent", "Access request", "Please review.",
                "/consent", "k-" + UUID.randomUUID()));
        relay.dispatchDue(10);
        assertThat(sender.delivered).singleElement().satisfies(m -> {
            assertThat(m.recipientEmail()).isEqualTo("alice@example.test");
            assertThat(m.kind()).isEqualTo("CONSENT_REQUEST");
        });
    }

    @Test
    void emailOnlyRowsAreNeverInAnInboxAndLoseTheirTextOnceSent() {
        String counterparty = "trustee-" + UUID.randomUUID() + "@example.test";
        String key = "k-" + UUID.randomUUID();
        outbox.enqueue(Notification.toAddress(counterparty, "WAITING_NUDGE", "waiting-on", "Following up",
                "Your invite code is 123456", "reply+x@reply.test", key));

        relay.dispatchDue(10);

        assertThat(sender.delivered).singleElement().satisfies(m -> {
            assertThat(m.recipientEmail()).isEqualTo(counterparty);
            assertThat(m.recipientUid()).isNull();
            assertThat(m.replyTo()).isEqualTo("reply+x@reply.test");
        });
        var row = dsl.selectFrom(NOTIFICATIONS).where(NOTIFICATIONS.DEDUPE_KEY.eq(key)).fetchSingle();
        assertThat(row.getStatus()).isEqualTo("SENT");
        assertThat(row.getInApp()).isFalse();
        assertThat(row.getBody()).isNull();
    }

    @Test
    void aRepeatedDedupeKeyStoresTheNotificationOnce() {
        String alice = uid("alice");
        contacts.remember(alice, alice + "@example.test");
        Notification n = Notification.toUser(alice, "ESCALATION", "waiting-on", "Owner ping", "body", null, "same-key");

        assertThat(outbox.enqueue(n)).isTrue();
        assertThat(outbox.enqueue(n)).isFalse();
        assertThat(dsl.fetchCount(NOTIFICATIONS, NOTIFICATIONS.DEDUPE_KEY.eq("same-key"))).isEqualTo(1);
        relay.dispatchDue(10);
        assertThat(sender.delivered).hasSize(1);
    }

    @Test
    void anAddressThatIsNotOnFileRetriesThenDeadLettersWithTheReasonKept() {
        String bob = uid("bob"); // no contact recorded
        String key = "k-" + UUID.randomUUID();
        outbox.enqueue(Notification.toUser(bob, "CONSENT_REQUEST", "consent", "Access request", "body", null, key));
        NotificationRelay twoAttempts = new NotificationRelay(dsl, new TransactionTemplate(txManager), clock, sender,
                contacts, 2, Duration.ofSeconds(30), Duration.ofHours(1));

        assertThat(twoAttempts.dispatchDue(10).retried()).isEqualTo(1);
        clock.advance(Duration.ofSeconds(30));
        assertThat(twoAttempts.dispatchDue(10).dead()).isEqualTo(1);

        var row = dsl.selectFrom(NOTIFICATIONS).where(NOTIFICATIONS.DEDUPE_KEY.eq(key)).fetchSingle();
        assertThat(row.getStatus()).isEqualTo("DEAD");
        assertThat(row.getLastError()).contains("no email address on file");
        assertThat(row.getTitle()).isEqualTo("Access request"); // still visible in the inbox
        assertThat(sender.delivered).isEmpty();
    }
}
