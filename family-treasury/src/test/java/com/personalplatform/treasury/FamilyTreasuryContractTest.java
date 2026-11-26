package com.personalplatform.treasury;

import static com.personalplatform.treasury.contract.ContractSchemas.assertMatches;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

/**
 * The real service's responses match {@code contracts/family-treasury/*.schema.json}, the same files the workspace's
 * demo-mode mock ledger is checked against.
 */
class FamilyTreasuryContractTest extends AbstractIntegrationTest {

    private static String ok(ResultActions r) throws Exception {
        return r.andExpect(status().is2xxSuccessful()).andReturn().getResponse().getContentAsString();
    }

    @Test
    void householdLedgerApprovalsAndReportsMatchTheirContracts() throws Exception {
        String owner = uid("contract-owner");
        Household h = newHousehold(owner, 10_000L);
        String base = "/v1/households/" + h.id();
        UUID kidPot = addMember(h, uid("contract-kid"), "KID");

        assertMatches("family-treasury/entry.schema.json", ok(post(base + "/deposits", owner, key(),
                Map.of("toAccountId", h.pool(), "amountMinor", 500_000, "description", "Pay"))));
        String posted = ok(post(base + "/spends", owner, key(), spendBody(h.pool(), 100)));
        assertMatches("family-treasury/spend-result.schema.json", posted); // POSTED, approval null
        assertMatches("family-treasury/spend-result.schema.json",
                ok(post(base + "/spends", owner, key(), spendBody(h.pool(), 50_000)))); // PENDING_APPROVAL, entry null
        assertMatches("family-treasury/schedule.schema.json", ok(post(base + "/allowance-schedules", owner, null,
                Map.of("toAccountId", kidPot, "amountMinor", 500, "frequency", "WEEKLY", "startDate",
                        LocalDate.now().toString(), "description", "pocket money"))));
        assertMatches("family-treasury/invite-created.schema.json",
                ok(post(base + "/invites", owner, null, Map.of("role", "MEMBER"))));

        assertMatches("family-treasury/household-list.schema.json", ok(get("/v1/households", owner)));
        assertMatches("family-treasury/household.schema.json", ok(get(base, owner)));
        assertMatches("family-treasury/account-list.schema.json", ok(get(base + "/accounts", owner)));
        assertMatches("family-treasury/account.schema.json", ok(get(base + "/accounts/" + kidPot, owner)));
        String entries = ok(get(base + "/entries?page=0&size=20", owner));
        assertMatches("family-treasury/entry-list.schema.json", entries);
        String entryId = JsonPath.read(entries, "$[0].id");
        assertMatches("family-treasury/entry.schema.json", ok(get(base + "/entries/" + entryId, owner)));
        assertMatches("family-treasury/approval-list.schema.json", ok(get(base + "/approvals", owner)));
        assertMatches("family-treasury/approval-list.schema.json",
                ok(get(base + "/approvals?status=PENDING_APPROVAL", owner)));
        assertMatches("family-treasury/schedule-list.schema.json", ok(get(base + "/allowance-schedules", owner)));
        assertMatches("family-treasury/reconciliation.schema.json", ok(get(base + "/reconciliation", owner)));
        assertMatches("family-treasury/invite-list.schema.json", ok(get(base + "/invites", owner)));
        assertMatches("family-treasury/statement.schema.json",
                ok(get(base + "/accounts/" + h.pool() + "/statement?page=0&size=20", owner)));
    }
}
