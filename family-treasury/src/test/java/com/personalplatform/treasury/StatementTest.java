package com.personalplatform.treasury;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

class StatementTest extends AbstractIntegrationTest {

    private Household seeded(UUID[] potOut) throws Exception {
        Household h = newHousehold(uid("owner"), null);
        UUID pot = addMember(h, uid("m"), "MEMBER");
        potOut[0] = pot;
        deposit(h, 10_000);                                   // 10:00
        clock.advance(Duration.ofHours(1));
        deposit(h, 5_000);                                    // 11:00
        clock.advance(Duration.ofHours(1));
        post("/v1/households/" + h.id() + "/spends", h.owner(), key(), spendBody(null, 2_500)).andExpect(status().isCreated()); // 12:00
        clock.advance(Duration.ofHours(1));
        post("/v1/households/" + h.id() + "/transfers", h.owner(), key(),
                Map.of("fromAccountId", h.pool(), "toAccountId", pot, "amountMinor", 1_000, "description", "to pot"))
                .andExpect(status().isCreated());              // 13:00
        return h;
    }

    @Test
    void runningBalanceIsCorrectOnEveryRowAcrossPagesAndDateFilters() throws Exception {
        Household h = seeded(new UUID[1]);
        String base = "/v1/households/" + h.id() + "/accounts/" + h.pool() + "/statement";

        get(base, h.owner()).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRows").value(4))
                .andExpect(jsonPath("$.currentBalanceMinor").value(11_500))
                .andExpect(jsonPath("$.rows[*].amountMinor").value(org.hamcrest.Matchers.contains(10_000, 5_000, -2_500, -1_000)))
                .andExpect(jsonPath("$.rows[*].balanceMinor").value(org.hamcrest.Matchers.contains(10_000, 15_000, 12_500, 11_500)));

        // page 2 of size 2: running balance still accounts for the rows on earlier pages
        get(base + "?page=1&size=2", h.owner())
                .andExpect(jsonPath("$.rows.length()").value(2))
                .andExpect(jsonPath("$.rows[*].balanceMinor").value(org.hamcrest.Matchers.contains(12_500, 11_500)));

        // date filter from 12:00 (inclusive): opening balance is carried in, not reset
        get(base + "?from=2026-03-02T12:00:00Z", h.owner())
                .andExpect(jsonPath("$.totalRows").value(2))
                .andExpect(jsonPath("$.rows[*].balanceMinor").value(org.hamcrest.Matchers.contains(12_500, 11_500)));
        // to is exclusive
        get(base + "?to=2026-03-02T12:00:00Z", h.owner())
                .andExpect(jsonPath("$.rows[*].balanceMinor").value(org.hamcrest.Matchers.contains(10_000, 15_000)));

        // last running balance equals the projection and the raw ledger sum
        assertThat(balance(h, h.pool())).isEqualTo(11_500).isEqualTo(ledgerSum(h.pool()));
    }

    @Test
    void creditNormalAccountsShowTheirNaturalSign() throws Exception {
        Household h = seeded(new UUID[1]);
        get("/v1/households/" + h.id() + "/accounts/" + h.income() + "/statement", h.owner())
                .andExpect(jsonPath("$.rows[*].amountMinor").value(org.hamcrest.Matchers.contains(10_000, 5_000)))
                .andExpect(jsonPath("$.rows[*].balanceMinor").value(org.hamcrest.Matchers.contains(10_000, 15_000)))
                .andExpect(jsonPath("$.currentBalanceMinor").value(15_000));
    }

    @Test
    void pagingParametersAreValidated() throws Exception {
        Household h = seeded(new UUID[1]);
        get("/v1/households/" + h.id() + "/accounts/" + h.pool() + "/statement?size=0", h.owner()).andExpect(status().isBadRequest());
        get("/v1/households/" + h.id() + "/accounts/" + h.pool() + "/statement?page=-1", h.owner()).andExpect(status().isBadRequest());
        get("/v1/households/" + h.id() + "/accounts/" + h.pool() + "/statement?size=100000", h.owner()).andExpect(status().isBadRequest());
    }

    @Test
    void csvExportHasDecimalAmountsRunningBalanceAndNeutralisesFormulas() throws Exception {
        Household h = newHousehold(uid("owner"), null);
        deposit(h, 12_345);
        Map<String, Object> body = new HashMap<>(spendBody(null, 345));
        body.put("description", "=HYPERLINK(\"http://x\"),evil");
        post("/v1/households/" + h.id() + "/spends", h.owner(), key(), body).andExpect(status().isCreated());

        MvcResult r = get("/v1/households/" + h.id() + "/accounts/" + h.pool() + "/statement.csv", h.owner())
                .andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith("text/csv")).andReturn();
        String[] lines = r.getResponse().getContentAsString().split("\r\n");
        assertThat(lines).hasSize(3);
        assertThat(lines[0]).isEqualTo("posted_at,entry_id,kind,description,amount,balance,currency");
        assertThat(lines[1]).endsWith(",DEPOSIT,seed,123.45,123.45,USD");
        // formula prefix neutralised with a leading quote, then RFC 4180 quoting because of the comma and quotes
        assertThat(lines[2]).endsWith(",SPEND,\"'=HYPERLINK(\"\"http://x\"\"),evil\",-3.45,120.00,USD");
        assertThat(r.getResponse().getHeader("Content-Disposition")).contains("attachment");
    }
}
