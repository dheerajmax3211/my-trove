package com.personalplatform.consent.notify;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.consent.support.IntegrationTest;
import com.personalplatform.consent.support.RecordingNotificationOutbox;
import com.personalplatform.notify.Notification;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** A third party asking for access puts a notification in the owner's inbox (and their email, via the relay). */
class ConsentRequestNotificationTest extends IntegrationTest {

    @Autowired RecordingNotificationOutbox outbox;

    @Test
    void theOwnerIsNotifiedOfEveryNewAccessRequest() throws Exception {
        String owner = newOwner();
        Registered client = registerClient(owner, "profile.sizes:read");
        String requestId = createRequest(clientToken(client),
                "{'scopes':['profile.sizes:read'],'purpose':'fitting your order','durationSeconds':3600}");

        Notification n = outbox.forRequest(requestId);
        assertThat(n.recipientUid()).isEqualTo(owner);
        assertThat(n.inApp()).isTrue();
        assertThat(n.kind()).isEqualTo("CONSENT_REQUEST");
        assertThat(n.source()).isEqualTo("consent-gateway");
        assertThat(n.title()).contains("Shoe Shop");
        assertThat(n.body()).contains("profile.sizes:read").contains("fitting your order");
        assertThat(n.link()).isEqualTo("/consent");
    }
}
