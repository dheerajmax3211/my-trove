package com.personalplatform.treasury;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

class ReversalTest extends AbstractIntegrationTest {

    private UUID spend(Household h, long amount) throws Exception {
        MvcResult r = post("/v1/households/" + h.id() + "/spends", h.owner(), key(), spendBody(null, amount))
                .andExpect(status().isCreated()).andReturn();
        return UUID.fromString(read(r, "$.entry.id"));
    }

    @Test
    void reversalPostsAMirroredEntryAndRestoresBalancesWithoutTouchingTheOriginal() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        deposit(h, 10_000);
        UUID spent = spend(h, 4_000);
        long postingsBefore = ledgerSum(h.pool());

        MvcResult rev = post("/v1/households/" + h.id() + "/entries/" + spent + "/reverse", h.owner(), key(), Map.of("reason", "oops"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("REVERSAL"))
                .andExpect(jsonPath("$.reversesEntryId").value(spent.toString()))
                .andExpect(jsonPath("$.postings[*].amountMinor", containsInAnyOrder(4_000, -4_000)))
                .andReturn();

        assertThat(postingsBefore).isEqualTo(6_000);
        assertThat(balance(h, h.pool())).isEqualTo(10_000);
        assertThat(balance(h, h.expense())).isZero();
        // original entry is still there, unchanged
        get("/v1/households/" + h.id() + "/entries/" + spent, h.owner()).andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("SPEND")).andExpect(jsonPath("$.reversesEntryId").doesNotExist());
        assertThat(read(rev, "$.description")).contains("Reversal of: groceries").contains("oops");
    }

    @Test
    void anEntryCanOnlyBeReversedOnce() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        deposit(h, 10_000);
        UUID spent = spend(h, 1_000);
        post("/v1/households/" + h.id() + "/entries/" + spent + "/reverse", h.owner(), key(), null).andExpect(status().isCreated());
        post("/v1/households/" + h.id() + "/entries/" + spent + "/reverse", h.owner(), key(), null)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ALREADY_REVERSED"));
        assertThat(balance(h, h.pool())).isEqualTo(10_000);
    }

    @Test
    void aReversalCannotItselfBeReversed() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        UUID dep = deposit(h, 1_000);
        MvcResult rev = post("/v1/households/" + h.id() + "/entries/" + dep + "/reverse", h.owner(), key(), null)
                .andExpect(status().isCreated()).andReturn();
        post("/v1/households/" + h.id() + "/entries/" + read(rev, "$.id") + "/reverse", h.owner(), key(), null)
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("CANNOT_REVERSE_REVERSAL"));
    }

    @Test
    void reversalThatWouldOverdrawIsRefusedAndChangesNothing() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        UUID dep = deposit(h, 5_000);
        post("/v1/households/" + h.id() + "/spends", h.owner(), key(), spendBody(null, 4_000)).andExpect(status().isCreated());
        long entries = entryCount(h.id());
        post("/v1/households/" + h.id() + "/entries/" + dep + "/reverse", h.owner(), key(), null)
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INSUFFICIENT_FUNDS"));
        assertThat(entryCount(h.id())).isEqualTo(entries);
        assertThat(balance(h, h.pool())).isEqualTo(1_000);
    }

    @Test
    void reversalRequiresATrustedRoleAndAHouseholdEntry() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        Household other = newHousehold(uid("owner"), null);
        String member = uid("m");
        addMember(h, member, "MEMBER");
        UUID dep = deposit(h, 1_000);
        UUID otherDep = deposit(other, 1_000);
        post("/v1/households/" + h.id() + "/entries/" + dep + "/reverse", member, key(), null).andExpect(status().isForbidden());
        // an entry id from another household does not exist as far as this household is concerned
        post("/v1/households/" + h.id() + "/entries/" + otherDep + "/reverse", h.owner(), key(), null).andExpect(status().isNotFound());
        assertThat(balance(other, other.pool())).isEqualTo(1_000);
    }
}
