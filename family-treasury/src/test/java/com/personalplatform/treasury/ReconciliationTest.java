package com.personalplatform.treasury;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class ReconciliationTest extends AbstractIntegrationTest {

    @Test
    void healthyHouseholdReconciles() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        deposit(h, 9_999);
        post("/v1/households/" + h.id() + "/spends", h.owner(), key(), spendBody(null, 333)).andExpect(status().isCreated());
        get("/v1/households/" + h.id() + "/reconciliation", h.owner()).andExpect(status().isOk())
                .andExpect(jsonPath("$.consistent").value(true)).andExpect(jsonPath("$.drifts").isEmpty())
                .andExpect(jsonPath("$.ledgerImbalances").isEmpty());
    }

    @Test
    void deliberatelyCorruptedProjectionIsDetectedAndReportedPerAccount() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        deposit(h, 5_000);

        dsl.execute("update treasury.account_balances set balance = balance + 7 where account_id = ?", h.pool());

        get("/v1/households/" + h.id() + "/reconciliation", h.owner()).andExpect(status().isOk())
                .andExpect(jsonPath("$.consistent").value(false))
                .andExpect(jsonPath("$.drifts.length()").value(1))
                .andExpect(jsonPath("$.drifts[0].accountId").value(h.pool().toString()))
                .andExpect(jsonPath("$.drifts[0].projectedMinor").value(5_007))
                .andExpect(jsonPath("$.drifts[0].ledgerMinor").value(5_000))
                .andExpect(jsonPath("$.drifts[0].driftMinor").value(7));

        // the ledger itself is untouched and the true figure is recoverable from it
        assertThat(ledgerSum(h.pool())).isEqualTo(5_000);
        dsl.execute("update treasury.account_balances set balance = balance - 7 where account_id = ?", h.pool());
        get("/v1/households/" + h.id() + "/reconciliation", h.owner()).andExpect(jsonPath("$.consistent").value(true));
    }

    @Test
    void aMissingProjectionRowIsReportedAsDrift() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        UUID pot = addMember(h, uid("m"), "MEMBER");
        dsl.execute("delete from treasury.account_balances where account_id = ?", pot);
        get("/v1/households/" + h.id() + "/reconciliation", h.owner())
                .andExpect(jsonPath("$.consistent").value(false))
                .andExpect(jsonPath("$.drifts[0].accountId").value(pot.toString()))
                .andExpect(jsonPath("$.drifts[0].projectedMinor").doesNotExist());
    }

    @Test
    void onlyTrustedMembersMayRunItAndOutsidersLearnNothing() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        String member = uid("m");
        addMember(h, member, "MEMBER");
        get("/v1/households/" + h.id() + "/reconciliation", member).andExpect(status().isForbidden());
        get("/v1/households/" + h.id() + "/reconciliation", uid("stranger")).andExpect(status().isNotFound());
    }
}
