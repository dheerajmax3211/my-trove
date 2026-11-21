package com.personalplatform.treasury;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

class OperationsTest extends AbstractIntegrationTest {

    private String base(Household h) {
        return "/v1/households/" + h.id();
    }

    @Test
    void depositDebitsThePoolAndCreditsIncome() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        post(base(h) + "/deposits", h.owner(), key(), Map.of("amountMinor", 1_234, "description", "salary"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("DEPOSIT"))
                .andExpect(jsonPath("$.postings[*].amountMinor", containsInAnyOrder(1_234, -1_234)));
        assertThat(balance(h, h.pool())).isEqualTo(1_234);
        assertThat(balance(h, h.income())).isEqualTo(1_234); // natural side
        get(base(h) + "/accounts/" + h.income(), h.owner()).andExpect(jsonPath("$.rawBalanceMinor").value(-1_234));
    }

    @Test
    void invalidAmountsAndAccountTypesAreRejected() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        post(base(h) + "/deposits", h.owner(), key(), Map.of("amountMinor", 0, "description", "x")).andExpect(status().isBadRequest());
        post(base(h) + "/deposits", h.owner(), key(), Map.of("amountMinor", -5, "description", "x")).andExpect(status().isBadRequest());
        post(base(h) + "/deposits", h.owner(), key(), Map.of("amountMinor", 5)).andExpect(status().isBadRequest());
        post(base(h) + "/deposits", h.owner(), key(), Map.of("amountMinor", Long.MAX_VALUE, "description", "x")).andExpect(status().isBadRequest());
        // spending INTO the pool / out of an expense account is a type error
        post(base(h) + "/spends", h.owner(), key(), Map.of("fromAccountId", h.expense(), "amountMinor", 1, "description", "x"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("WRONG_ACCOUNT_TYPE"));
        post(base(h) + "/deposits", h.owner(), key(), Map.of("toAccountId", h.expense(), "amountMinor", 1, "description", "x"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void overdraftIsRefusedAndLeavesNoTrace() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        deposit(h, 1_000);
        long entries = entryCount(h.id());
        post(base(h) + "/spends", h.owner(), key(), spendBody(null, 1_001))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INSUFFICIENT_FUNDS"));
        assertThat(entryCount(h.id())).isEqualTo(entries);
        assertThat(balance(h, h.pool())).isEqualTo(1_000);
        post(base(h) + "/spends", h.owner(), key(), spendBody(null, 1_000)).andExpect(status().isCreated()); // exactly the balance is fine
        assertThat(balance(h, h.pool())).isZero();
    }

    @Test
    void transferRulesFollowRolesAndAccounts() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        String alice = uid("alice");
        String bob = uid("bob");
        UUID alicePot = addMember(h, alice, "MEMBER");
        UUID bobPot = addMember(h, bob, "MEMBER");
        deposit(h, 10_000);

        Map<String, Object> fund = Map.of("fromAccountId", h.pool(), "toAccountId", alicePot, "amountMinor", 4_000, "description", "fund");
        post(base(h) + "/transfers", alice, key(), fund).andExpect(status().isForbidden()); // members cannot drain the pool
        post(base(h) + "/transfers", h.owner(), key(), fund).andExpect(status().isCreated());
        assertThat(balance(h, alicePot)).isEqualTo(4_000);

        post(base(h) + "/transfers", alice, key(), Map.of("fromAccountId", alicePot, "toAccountId", bobPot, "amountMinor", 1_500, "description", "share"))
                .andExpect(status().isCreated());
        assertThat(balance(h, alicePot)).isEqualTo(2_500);
        assertThat(balance(h, bobPot)).isEqualTo(1_500);
        post(base(h) + "/transfers", bob, key(), Map.of("fromAccountId", alicePot, "toAccountId", bobPot, "amountMinor", 1, "description", "x"))
                .andExpect(status().isForbidden());
        post(base(h) + "/transfers", alice, key(), Map.of("fromAccountId", alicePot, "toAccountId", alicePot, "amountMinor", 1, "description", "x"))
                .andExpect(status().isBadRequest());
        post(base(h) + "/transfers", alice, key(), Map.of("fromAccountId", alicePot, "toAccountId", bobPot, "amountMinor", 2_501, "description", "x"))
                .andExpect(status().isUnprocessableEntity());
        assertThat(balance(h, alicePot) + balance(h, bobPot) + balance(h, h.pool())).isEqualTo(10_000);
    }

    @Test
    void differentCurrenciesCannotBeMixedInOneOperation() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        MvcResult eur = post(base(h) + "/accounts", h.owner(), null,
                Map.of("code", "TRIP-EUR", "name", "Trip pot", "type", "ASSET", "currency", "EUR")).andExpect(status().isCreated()).andReturn();
        deposit(h, 1_000);
        post(base(h) + "/transfers", h.owner(), key(),
                Map.of("fromAccountId", h.pool(), "toAccountId", read(eur, "$.id"), "amountMinor", 100, "description", "fx"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("CURRENCY_MISMATCH"));
        post(base(h) + "/accounts", h.owner(), null, Map.of("code", "TRIP-EUR", "name", "dup", "type", "ASSET"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ACCOUNT_CODE_TAKEN"));
    }

    @Test
    void splitUsesLargestRemainderSoTheSharesAlwaysSumToTheTotal() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        String a = uid("a");
        String b = uid("b");
        String c = uid("c");
        UUID pa = addMember(h, a, "MEMBER");
        UUID pb = addMember(h, b, "MEMBER");
        UUID pc = addMember(h, c, "MEMBER");
        deposit(h, 30_000);
        for (UUID pot : List.of(pa, pb, pc)) {
            post(base(h) + "/transfers", h.owner(), key(),
                    Map.of("fromAccountId", h.pool(), "toAccountId", pot, "amountMinor", 1_000, "description", "fund")).andExpect(status().isCreated());
        }

        MvcResult r = post(base(h) + "/splits", h.owner(), key(), Map.of("totalMinor", 100, "description", "pizza",
                "shares", List.of(Map.of("accountId", pa), Map.of("accountId", pb), Map.of("accountId", pc))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.allocations[*].shareMinor").value(org.hamcrest.Matchers.contains(34, 33, 33)))
                .andReturn();
        assertThat(balance(h, pa)).isEqualTo(1_000 - 34);
        assertThat(balance(h, pb)).isEqualTo(1_000 - 33);
        assertThat(balance(h, pc)).isEqualTo(1_000 - 33);
        assertThat(balance(h, h.expense())).isEqualTo(100);
        assertThat(read(r, "$.entry.postings.length()")).isEqualTo("4");

        // weighted 1:2:2 over 7 minor units -> exact 1.4/2.8/2.8 -> 1,3,3
        post(base(h) + "/splits", h.owner(), key(), Map.of("totalMinor", 7, "description", "weighted",
                "shares", List.of(Map.of("accountId", pa, "weight", 1), Map.of("accountId", pb, "weight", 2), Map.of("accountId", pc, "weight", 2))))
                .andExpect(jsonPath("$.allocations[*].shareMinor").value(org.hamcrest.Matchers.contains(1, 3, 3)));

        // 1 minor unit over 3 people: only one posting line is written (no zero-amount lines)
        post(base(h) + "/splits", h.owner(), key(), Map.of("totalMinor", 1, "description", "tiny",
                "shares", List.of(Map.of("accountId", pa), Map.of("accountId", pb), Map.of("accountId", pc))))
                .andExpect(jsonPath("$.entry.postings.length()").value(2));
        assertThat(reconcile(h)).isTrue();
    }

    @Test
    void splitMayOnlyDrawOnMemberPotsThatTheCallerIsAllowedToDebit() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        String alice = uid("alice");
        String bob = uid("bob");
        UUID pa = addMember(h, alice, "MEMBER");
        UUID pb = addMember(h, bob, "MEMBER");
        deposit(h, 5_000);
        // the shared pool cannot be a split source (it is guarded by approvals)
        post(base(h) + "/splits", h.owner(), key(), Map.of("totalMinor", 10, "description", "x", "shares", List.of(Map.of("accountId", h.pool()))))
                .andExpect(status().isUnprocessableEntity());
        // alice may not draw on bob's pot
        post(base(h) + "/splits", alice, key(), Map.of("totalMinor", 10, "description", "x",
                "shares", List.of(Map.of("accountId", pa), Map.of("accountId", pb)))).andExpect(status().isForbidden());
        // duplicates are rejected
        post(base(h) + "/splits", h.owner(), key(), Map.of("totalMinor", 10, "description", "x",
                "shares", List.of(Map.of("accountId", pa), Map.of("accountId", pa)))).andExpect(status().isBadRequest());
        // pots without funds make the split fail as a whole
        post(base(h) + "/splits", h.owner(), key(), Map.of("totalMinor", 10, "description", "x",
                "shares", List.of(Map.of("accountId", pa), Map.of("accountId", pb)))).andExpect(status().isUnprocessableEntity());
    }

    @Test
    void membersAndRolesAreManagedByOwnersOnly() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        String m = uid("m");
        addMember(h, m, "MEMBER");
        post(base(h) + "/members", m, null, Map.of("uid", uid("x"), "role", "MEMBER")).andExpect(status().isForbidden());
        post(base(h) + "/members", h.owner(), null, Map.of("uid", m, "role", "MEMBER")).andExpect(status().isConflict());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(base(h) + "/members/" + h.owner() + "/role")
                .header("Authorization", bearer(h.owner())).contentType("application/json").content("{\"role\":\"MEMBER\"}"))
                .andExpect(status().isConflict()); // would leave the household without an OWNER
        get(base(h) + "/members", m).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
    }

    private boolean reconcile(Household h) throws Exception {
        MvcResult r = get(base(h) + "/reconciliation", h.owner()).andExpect(status().isOk()).andReturn();
        return Boolean.parseBoolean(read(r, "$.consistent"));
    }
}
