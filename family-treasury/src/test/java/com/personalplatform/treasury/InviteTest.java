package com.personalplatform.treasury;

import static com.personalplatform.sql.jooq.treasury.treasury.Tables.HOUSEHOLD_INVITES;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/** Join by invite code: the way a second account gets into a household, with no member IDs typed in. */
class InviteTest extends AbstractIntegrationTest {

    private String createInvite(Household h, String role) throws Exception {
        MvcResult r = post("/v1/households/" + h.id() + "/invites", h.owner(), null, Map.of("role", role))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").isNotEmpty())
                .andReturn();
        return read(r, "$.code");
    }

    private void accept(String uid, String name, String code) throws Exception {
        post("/v1/households/invites/accept", uid + "|" + name, null, Map.of("code", code)).andExpect(status().isOk());
    }

    @Test
    void ownerInvitesMemberByCodeAndTheyJoinWithTheirOwnPot() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        String member = uid("member");
        String code = createInvite(h, "MEMBER");

        MvcResult joined = post("/v1/households/invites/accept", member + "|Ben Rao", null, Map.of("code", code))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(h.id().toString()))
                .andReturn();
        assertThat(read(joined, "$.members[?(@.uid=='" + member + "')].role")).contains("MEMBER");
        assertThat(read(joined, "$.accounts[?(@.code=='POT:" + member + "')].name")).contains("Ben Rao pot");

        MvcResult members = get("/v1/households/" + h.id() + "/members", h.owner()).andExpect(status().isOk()).andReturn();
        assertThat(read(members, "$[?(@.uid=='" + member + "')].displayName")).contains("Ben Rao");
    }

    @Test
    void approverInviteGivesTheApproverRole() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        String approver = uid("approver");
        accept(approver, "Ana", createInvite(h, "APPROVER"));
        MvcResult members = get("/v1/households/" + h.id() + "/members", h.owner()).andReturn();
        assertThat(read(members, "$[?(@.uid=='" + approver + "')].role")).contains("APPROVER");
    }

    @Test
    void aCodeWorksOnce() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        String code = createInvite(h, "MEMBER");
        accept(uid("first"), "First", code);
        post("/v1/households/invites/accept", uid("second"), null, Map.of("code", code))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVITE_INVALID"));
    }

    @Test
    void redeemingAsAnExistingMemberIsRefusedAndDoesNotUseUpTheCode() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        String code = createInvite(h, "MEMBER");
        post("/v1/households/invites/accept", h.owner(), null, Map.of("code", code))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_MEMBER"));
        accept(uid("someone"), "Someone", code);
    }

    @Test
    void onlyAnOwnerCanInviteOrSeeInvites() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        String member = uid("member");
        accept(member, "Member", createInvite(h, "MEMBER"));
        post("/v1/households/" + h.id() + "/invites", member, null, Map.of("role", "MEMBER"))
                .andExpect(status().isForbidden());
        get("/v1/households/" + h.id() + "/invites", member).andExpect(status().isForbidden());
    }

    @Test
    void revokedCodeStopsWorking() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        String code = createInvite(h, "MEMBER");
        MvcResult pending = get("/v1/households/" + h.id() + "/invites", h.owner()).andExpect(status().isOk()).andReturn();
        String inviteId = read(pending, "$[0].id");
        mvc.perform(MockMvcRequestBuilders.delete("/v1/households/" + h.id() + "/invites/" + inviteId)
                        .header("Authorization", bearer(h.owner())))
                .andExpect(status().isNoContent());
        post("/v1/households/invites/accept", uid("late"), null, Map.of("code", code))
                .andExpect(status().isBadRequest());
    }

    @Test
    void pendingListShowsOpenInvitesOnly() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        createInvite(h, "MEMBER");
        accept(uid("used"), "Used", createInvite(h, "MEMBER"));
        MvcResult pending = get("/v1/households/" + h.id() + "/invites", h.owner()).andExpect(status().isOk()).andReturn();
        assertThat(read(pending, "$.length()")).isEqualTo("1");
    }

    @Test
    void theCodeIsNotStoredInClear() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        String code = createInvite(h, "MEMBER");
        long matches = dsl.fetchCount(HOUSEHOLD_INVITES, HOUSEHOLD_INVITES.CODE_HASH.eq(code));
        assertThat(matches).isZero();
    }
}
