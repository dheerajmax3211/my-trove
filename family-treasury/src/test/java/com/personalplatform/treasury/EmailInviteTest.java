package com.personalplatform.treasury;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.personalplatform.treasury.household.InvitationNotifier;
import com.personalplatform.treasury.household.InvitationNotifier.EmailInvitation;
import com.personalplatform.treasury.household.Role;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MvcResult;

/** With an {@link InvitationNotifier} wired (W3 implements it), an email invite hands the code to it exactly once. */
class EmailInviteTest extends AbstractIntegrationTest {

    @MockitoBean InvitationNotifier notifier;

    @Test
    void anEmailInviteHandsTheCodeAndExpiryToTheNotifierOnce() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        MvcResult r = post("/v1/households/" + h.id() + "/invites", h.owner(), null,
                Map.of("role", "APPROVER", "email", "ana@example.test", "ttlHours", 24))
                .andExpect(status().isCreated())
                .andReturn();
        String code = read(r, "$.code");

        ArgumentCaptor<EmailInvitation> sent = ArgumentCaptor.forClass(EmailInvitation.class);
        verify(notifier).invitationCreated(sent.capture());
        EmailInvitation invitation = sent.getValue();
        assertThat(invitation.householdId()).isEqualTo(h.id());
        assertThat(invitation.inviteId().toString()).isEqualTo(read(r, "$.id"));
        assertThat(invitation.role()).isEqualTo(Role.APPROVER);
        assertThat(invitation.recipientEmail()).isEqualTo("ana@example.test");
        assertThat(invitation.code()).isEqualTo(code);
        assertThat(invitation.expiresAt()).isEqualTo(Instant.parse(read(r, "$.expiresAt")));
    }

    @Test
    void theCodeStillJoinsTheHouseholdAfterTheEmailWentOut() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        MvcResult r = post("/v1/households/" + h.id() + "/invites", h.owner(), null,
                Map.of("role", "MEMBER", "email", "ben@example.test"))
                .andExpect(status().isCreated())
                .andReturn();
        post("/v1/households/invites/accept", uid("ben") + "|Ben", null, Map.of("code", read(r, "$.code")))
                .andExpect(status().isOk());
    }

    @Test
    void aMalformedAddressIsRejectedWithoutNotifying() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        post("/v1/households/" + h.id() + "/invites", h.owner(), null,
                Map.of("role", "MEMBER", "email", "not-an-email"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(notifier);
    }

    @Test
    void aCodeOnlyInviteNeverNotifies() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        post("/v1/households/" + h.id() + "/invites", h.owner(), null, Map.of("role", "MEMBER"))
                .andExpect(status().isCreated());
        verify(notifier, never()).invitationCreated(any());
    }
}
