package com.personalplatform.treasury;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/** Cross-household isolation: an outsider gets 404 everywhere, and ids from another household never resolve. */
class IsolationTest extends AbstractIntegrationTest {

    @Test
    void outsiderGets404OnEveryEndpoint() throws Exception {
        Household h = newHousehold(uid("owner"), 10_000L);
        UUID deposit = deposit(h, 50_000);
        String stranger = uid("stranger");
        String base = "/v1/households/" + h.id();
        UUID anyId = UUID.randomUUID();
        Map<String, Object> amount = Map.of("amountMinor", 100, "description", "x");

        get(base, stranger).andExpect(status().isNotFound());
        get(base + "/members", stranger).andExpect(status().isNotFound());
        get(base + "/accounts", stranger).andExpect(status().isNotFound());
        get(base + "/accounts/" + h.pool(), stranger).andExpect(status().isNotFound());
        get(base + "/accounts/" + h.pool() + "/statement", stranger).andExpect(status().isNotFound());
        get(base + "/accounts/" + h.pool() + "/statement.csv", stranger).andExpect(status().isNotFound());
        get(base + "/entries", stranger).andExpect(status().isNotFound());
        get(base + "/entries/" + deposit, stranger).andExpect(status().isNotFound());
        get(base + "/approvals", stranger).andExpect(status().isNotFound());
        get(base + "/approvals/" + anyId, stranger).andExpect(status().isNotFound());
        get(base + "/reconciliation", stranger).andExpect(status().isNotFound());
        get(base + "/allowance-schedules", stranger).andExpect(status().isNotFound());
        post(base + "/deposits", stranger, key(), amount).andExpect(status().isNotFound());
        post(base + "/spends", stranger, key(), spendBody(null, 100)).andExpect(status().isNotFound());
        post(base + "/transfers", stranger, key(), Map.of("fromAccountId", h.pool(), "toAccountId", h.pool(), "amountMinor", 1, "description", "x"))
                .andExpect(status().isNotFound());
        post(base + "/splits", stranger, key(), Map.of("totalMinor", 10, "description", "x", "shares", java.util.List.of(Map.of("accountId", h.pool()))))
                .andExpect(status().isNotFound());
        post(base + "/entries/" + deposit + "/reverse", stranger, key(), null).andExpect(status().isNotFound());
        post(base + "/approvals/" + anyId + "/approve", stranger, key(), null).andExpect(status().isNotFound());
        post(base + "/approvals/" + anyId + "/reject", stranger, key(), null).andExpect(status().isNotFound());
        post(base + "/members", stranger, null, Map.of("uid", stranger, "role", "OWNER")).andExpect(status().isNotFound());
        post(base + "/accounts", stranger, null, Map.of("code", "X", "name", "x", "type", "ASSET")).andExpect(status().isNotFound());
        post(base + "/allowance-schedules", stranger, null,
                Map.of("toAccountId", h.pool(), "amountMinor", 1, "frequency", "WEEKLY", "startDate", "2027-01-01", "description", "x"))
                .andExpect(status().isNotFound());
        mvc.perform(MockMvcRequestBuilders.put(base + "/settings").header("Authorization", bearer(stranger))
                .contentType("application/json").content("{\"approvalExpiryHours\":1}")).andExpect(status().isNotFound());
        mvc.perform(MockMvcRequestBuilders.delete(base + "/allowance-schedules/" + anyId).header("Authorization", bearer(stranger)))
                .andExpect(status().isNotFound());

        // nothing changed
        assertThat(balance(h, h.pool())).isEqualTo(50_000);
        get("/v1/households", stranger).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void ownersOfDifferentHouseholdsCannotReachEachOthersAccountsOrEntries() throws Exception {
        Household a = newHousehold(uid("a"), null);
        Household b = newHousehold(uid("b"), null);
        UUID aDeposit = deposit(a, 10_000);
        deposit(b, 10_000);

        // b's owner addressing b's household but with a's account ids: the accounts do not exist there
        post("/v1/households/" + b.id() + "/spends", b.owner(), key(), spendBody(a.pool(), 100)).andExpect(status().isNotFound());
        post("/v1/households/" + b.id() + "/transfers", b.owner(), key(),
                Map.of("fromAccountId", b.pool(), "toAccountId", a.pool(), "amountMinor", 100, "description", "steal")).andExpect(status().isNotFound());
        post("/v1/households/" + b.id() + "/deposits", b.owner(), key(),
                Map.of("toAccountId", a.pool(), "amountMinor", 100, "description", "x")).andExpect(status().isNotFound());
        get("/v1/households/" + b.id() + "/accounts/" + a.pool(), b.owner()).andExpect(status().isNotFound());
        get("/v1/households/" + b.id() + "/accounts/" + a.pool() + "/statement", b.owner()).andExpect(status().isNotFound());
        get("/v1/households/" + b.id() + "/entries/" + aDeposit, b.owner()).andExpect(status().isNotFound());
        // and the other household is untouched
        assertThat(balance(a, a.pool())).isEqualTo(10_000);
        assertThat(balance(b, b.pool())).isEqualTo(10_000);
    }

    @Test
    void membershipOfOneHouseholdGivesNoAccessToAnother() throws Exception {
        Household a = newHousehold(uid("a"), null);
        Household b = newHousehold(uid("b"), null);
        get("/v1/households/" + a.id(), b.owner()).andExpect(status().isNotFound());
        get("/v1/households/" + b.id(), a.owner()).andExpect(status().isNotFound());
        get("/v1/households", a.owner()).andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(a.id().toString()));
    }

    @Test
    void unauthenticatedRequestsAreRejected() throws Exception {
        mvc.perform(MockMvcRequestBuilders.get("/v1/households")).andExpect(status().isUnauthorized());
        mvc.perform(MockMvcRequestBuilders.get("/v1/households").header("Authorization", "Bearer !!!")).andExpect(status().isUnauthorized());
        mvc.perform(MockMvcRequestBuilders.get("/actuator/health")).andExpect(status().isNotFound()); // health is served on the private management port only (ObservabilityExposureTest)
    }

    @Test
    void kidsSeeAndTouchOnlyTheirOwnPot() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        String kid = uid("kid");
        String sibling = uid("sibling");
        UUID kidPot = addMember(h, kid, "KID");
        UUID siblingPot = addMember(h, sibling, "KID");
        deposit(h, 20_000);
        post("/v1/households/" + h.id() + "/transfers", h.owner(), key(),
                Map.of("fromAccountId", h.pool(), "toAccountId", kidPot, "amountMinor", 5_000, "description", "allowance"))
                .andExpect(status().isCreated());

        get("/v1/households/" + h.id() + "/accounts/" + siblingPot, kid).andExpect(status().isNotFound());
        get("/v1/households/" + h.id() + "/accounts/" + siblingPot + "/statement", kid).andExpect(status().isNotFound());
        get("/v1/households/" + h.id() + "/accounts/" + kidPot + "/statement", kid).andExpect(status().isOk());
        get("/v1/households/" + h.id() + "/entries", kid).andExpect(status().isForbidden());
        post("/v1/households/" + h.id() + "/deposits", kid, key(), Map.of("amountMinor", 1, "description", "x")).andExpect(status().isForbidden());
        post("/v1/households/" + h.id() + "/spends", kid, key(), spendBody(null, 100)).andExpect(status().isForbidden()); // pool
        post("/v1/households/" + h.id() + "/spends", kid, key(), spendBody(siblingPot, 100)).andExpect(status().isForbidden());
        post("/v1/households/" + h.id() + "/spends", kid, key(), spendBody(kidPot, 100)).andExpect(status().isCreated());
        post("/v1/households/" + h.id() + "/transfers", kid, key(),
                Map.of("fromAccountId", kidPot, "toAccountId", siblingPot, "amountMinor", 100, "description", "gift")).andExpect(status().isCreated());
        post("/v1/households/" + h.id() + "/transfers", kid, key(),
                Map.of("fromAccountId", siblingPot, "toAccountId", kidPot, "amountMinor", 100, "description", "grab")).andExpect(status().isForbidden());
        get("/v1/households/" + h.id() + "/accounts", kid).andExpect(jsonPath("$[?(@.ownerUid=='" + sibling + "')]").isEmpty());
    }
}
