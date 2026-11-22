package com.personalplatform.treasury;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MvcResult;

/** An owner can send the invite code to the invitee's address; the code goes in that email and nowhere else. */
class InviteEmailTest extends AbstractIntegrationTest {

    @Autowired RecordingNotificationOutbox outbox;

    @Test
    void theInviteCodeIsEmailedToTheInviteeWhenAnAddressIsGiven() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        String address = "ben-" + UUID.randomUUID() + "@example.test";
        MvcResult r = post("/v1/households/" + h.id() + "/invites", h.owner(), null,
                Map.of("role", "MEMBER", "inviteeEmail", address)).andExpect(status().isCreated()).andReturn();
        String code = read(r, "$.code");

        assertThat(outbox.toAddress(address)).singleElement().satisfies(n -> {
            assertThat(n.inApp()).isFalse();
            assertThat(n.recipientUid()).isNull();
            assertThat(n.kind()).isEqualTo("HOUSEHOLD_INVITE");
            assertThat(n.source()).isEqualTo("family-treasury");
            assertThat(n.body()).contains(code);
        });
    }

    @Test
    void noEmailIsWrittenWhenNoAddressIsGiven() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        String address = "nobody-" + UUID.randomUUID() + "@example.test";
        post("/v1/households/" + h.id() + "/invites", h.owner(), null, Map.of("role", "MEMBER"))
                .andExpect(status().isCreated());
        assertThat(outbox.toAddress(address)).isEmpty();
    }

    @Test
    void anInvalidAddressIsRejected() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        post("/v1/households/" + h.id() + "/invites", h.owner(), null,
                Map.of("role", "MEMBER", "inviteeEmail", "not-an-address")).andExpect(status().isBadRequest());
    }
}
