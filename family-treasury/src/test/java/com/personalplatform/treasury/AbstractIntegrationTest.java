package com.personalplatform.treasury;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jooq.DSLContext;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import tools.jackson.databind.json.JsonMapper;

/** One Spring context and one Postgres container shared by every integration test; each test builds its own households. */
@Import({TestcontainersConfiguration.class, TestSupportConfig.class})
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "treasury.scheduler.enabled=false")
abstract class AbstractIntegrationTest {

    @Autowired protected MockMvc mvc;
    @Autowired protected DSLContext dsl;
    @Autowired protected JsonMapper json;
    @Autowired protected TestSupportConfig.MutableClock clock;

    @BeforeEach
    void resetClock() {
        clock.set(TestSupportConfig.START);
    }

    record Household(UUID id, String owner, UUID pool, UUID income, UUID expense) {}

    protected static String uid(String prefix) {
        return prefix + "-" + UUID.randomUUID();
    }

    protected static String key() {
        return UUID.randomUUID().toString();
    }

    protected static String bearer(String uid) {
        return "Bearer " + Base64.getUrlEncoder().withoutPadding().encodeToString(uid.getBytes(StandardCharsets.UTF_8));
    }

    protected ResultActions post(String path, String uid, String idemKey, Object body) throws Exception {
        var req = MockMvcRequestBuilders.post(path).header("Authorization", bearer(uid)).contentType(MediaType.APPLICATION_JSON)
                .content(body == null ? "{}" : json.writeValueAsString(body));
        if (idemKey != null) {
            req = req.header("Idempotency-Key", idemKey);
        }
        return mvc.perform(req);
    }

    protected ResultActions get(String path, String uid) throws Exception {
        return mvc.perform(MockMvcRequestBuilders.get(path).header("Authorization", bearer(uid)));
    }

    protected static String read(MvcResult r, String path) throws Exception {
        Object v = JsonPath.read(r.getResponse().getContentAsString(), path);
        return String.valueOf(v);
    }

    protected Household newHousehold(String owner, Long threshold) throws Exception {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("name", "Test household");
        body.put("currency", "USD");
        if (threshold != null) {
            body.put("approvalThresholdMinor", threshold);
        }
        body.put("approvalExpiryHours", 48);
        MvcResult r = post("/v1/households", owner, key(), body).andExpect(status().isCreated()).andReturn();
        UUID id = UUID.fromString(read(r, "$.id"));
        return new Household(id, owner, account(id, owner, "POOL"), account(id, owner, "INCOME:DEPOSITS"),
                account(id, owner, "EXPENSE:GENERAL"));
    }

    protected UUID account(UUID household, String asUid, String code) throws Exception {
        MvcResult r = get("/v1/households/" + household + "/accounts", asUid).andExpect(status().isOk()).andReturn();
        List<String> ids = JsonPath.read(r.getResponse().getContentAsString(), "$[?(@.code=='" + code + "')].id");
        return UUID.fromString(ids.get(0));
    }

    /** Adds a member and returns their pot account id. */
    protected UUID addMember(Household h, String uid, String role) throws Exception {
        post("/v1/households/" + h.id() + "/members", h.owner(), null, Map.of("uid", uid, "role", role, "displayName", uid))
                .andExpect(status().isCreated());
        return account(h.id(), h.owner(), "POT:" + uid);
    }

    protected UUID deposit(Household h, long amount) throws Exception {
        MvcResult r = post("/v1/households/" + h.id() + "/deposits", h.owner(), key(),
                Map.of("amountMinor", amount, "description", "seed")).andExpect(status().isCreated()).andReturn();
        return UUID.fromString(read(r, "$.id"));
    }

    protected long balance(Household h, UUID account) throws Exception {
        MvcResult r = get("/v1/households/" + h.id() + "/accounts/" + account, h.owner()).andExpect(status().isOk()).andReturn();
        return Long.parseLong(read(r, "$.balanceMinor"));
    }

    protected long ledgerSum(UUID account) {
        return dsl.fetchValue("select coalesce(sum(amount),0) from treasury.postings where account_id = ?", account) instanceof Number n
                ? n.longValue() : 0;
    }

    protected long entryCount(UUID household) {
        return dsl.fetchValue("select count(*) from treasury.journal_entries where household_id = ?", household) instanceof Number n
                ? n.longValue() : -1;
    }

    protected Map<String, Object> spendBody(UUID from, long amount) {
        Map<String, Object> m = new java.util.HashMap<>();
        if (from != null) {
            m.put("fromAccountId", from);
        }
        m.put("amountMinor", amount);
        m.put("description", "groceries");
        return m;
    }
}
