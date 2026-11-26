package com.personalplatform.mcp;

import static com.personalplatform.sql.jooq.mcp.mcp.Tables.TOOL_CALLS;
import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.mcp.audit.ToolCallAudit;
import com.personalplatform.sql.jooq.mcp.mcp.tables.records.ToolCallsRecord;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/** tools/call end to end against stubbed product services: data, consent refusals, bad input, failures, audit. */
class ToolCallTest extends McpTestBase {

    static final String ITEM_1 = "0190f0a0-0000-7000-8000-000000000101";
    static final String ITEM_2 = "0190f0a0-0000-7000-8000-000000000102";
    static final String APPLIANCE = "0190f0a0-0000-7000-8000-000000000201";
    static final String HOUSEHOLD = "0190f0a0-0000-7000-8000-000000000301";

    private ToolCallsRecord lastAudit() {
        return dsl.selectFrom(TOOL_CALLS).orderBy(TOOL_CALLS.ID.desc()).limit(1).fetchOne();
    }

    private static JsonNode result(JsonNode rpc) {
        assertThat(rpc.has("error")).as(rpc.toString()).isFalse();
        return rpc.path("result");
    }

    private static void assertToolError(JsonNode rpc, String code) {
        JsonNode r = result(rpc);
        assertThat(r.path("isError").asBoolean()).as(r.toString()).isTrue();
        assertThat(r.path("structuredContent").path("error").path("code").asString()).isEqualTo(code);
        assertThat(r.path("content").get(0).path("text").asString()).isNotBlank();
    }

    // ---- waiting_on_list_followups ---------------------------------------------------------------------------

    @Test
    void followupsListOpenItemsWithTheirNextStepUsingTheCallersOwnToken() throws Exception {
        String token = member("ann");
        service("waiting-on")
                .reply("/v1/items", 200, "[{\"id\":\"" + ITEM_1 + "\",\"title\":\"Laptop refund\",\"counterparty\":\"Shop\","
                        + "\"status\":\"NUDGED\",\"expectedBy\":\"2026-11-01\",\"amount\":499.00,\"currency\":\"EUR\"},"
                        + "{\"id\":\"" + ITEM_2 + "\",\"title\":\"Deposit\",\"counterparty\":\"Landlord\",\"status\":\"OPEN\","
                        + "\"expectedBy\":\"2026-12-01\",\"amount\":null,\"currency\":null}]")
                .reply("/v1/items/" + ITEM_1, 200, "{\"id\":\"" + ITEM_1 + "\",\"followUp\":{\"stage\":\"NUDGED\","
                        + "\"nextAction\":\"ESCALATE\",\"nextActionAt\":\"2026-11-30T09:00:00Z\",\"snoozedDays\":0}}")
                .reply("/v1/items/" + ITEM_2, 503, "{}");

        JsonNode r = result(callTool(token, "waiting_on_list_followups", "{\"limit\":5}"));

        assertThat(r.path("isError").asBoolean()).isFalse();
        JsonNode items = r.path("structuredContent").path("items");
        assertThat(items.size()).isEqualTo(2);
        assertThat(items.get(0).path("status").asString()).isEqualTo("NUDGED");
        assertThat(items.get(0).path("nextStep").path("action").asString()).isEqualTo("ESCALATE");
        assertThat(items.get(0).path("nextStep").path("at").asString()).isEqualTo("2026-11-30T09:00:00Z");
        assertThat(items.get(1).path("nextStep").isNull()).isTrue();   // workflow state unavailable: shown as unknown
        assertThat(r.path("content").get(0).path("text").asString()).contains("Laptop refund").contains("ESCALATE");

        var list = service("waiting-on").received().get(0);
        assertThat(list.path()).isEqualTo("/v1/items");
        assertThat(list.rawQuery()).contains("status=OPEN").contains("status=NUDGED").contains("status=ESCALATED")
                .contains("limit=5");
        assertThat(service("waiting-on").received()).allSatisfy(x -> assertThat(x.authorization()).isEqualTo("Bearer " + token));

        ToolCallsRecord audit = lastAudit();
        assertThat(audit.getTool()).isEqualTo("waiting_on_list_followups");
        assertThat(audit.getOutcome()).isEqualTo("OK");
        assertThat(audit.getPrincipalType()).isEqualTo("USER");
        assertThat(audit.getPrincipalId()).isEqualTo("ann");
        assertThat(audit.getResultBytes()).isGreaterThan(100);
        assertThat(audit.getArgumentsHash()).isEqualTo(ToolCallAudit.argumentsHash(Map.of("limit", 5)));
        assertThat(audit.getCalledAt()).isNotNull();
    }

    @Test
    void followupsRefuseALimitAboveTwentyWithoutCallingTheService() throws Exception {
        JsonNode rpc = callTool(member("ann"), "waiting_on_list_followups", "{\"limit\":500}");
        // The SDK validates against the input schema and answers with a tool error naming the rule.
        assertThat(result(rpc).path("isError").asBoolean()).isTrue();
        assertThat(rpc.path("result").path("content").get(0).path("text").asString()).contains("/limit");
        assertThat(service("waiting-on").received()).isEmpty();
        assertThat(lastAudit().getOutcome()).isEqualTo("INVALID");
        assertThat(lastAudit().getErrorCode()).isEqualTo("schema_validation");
    }

    // ---- ask_your_life_search --------------------------------------------------------------------------------

    @Test
    void searchReturnsPlainTextPassagesWithDocumentTitles() throws Exception {
        service("ask-your-life").reply("/v1/search", 200, "{\"query\":\"boiler warranty\",\"mode\":\"HYBRID\",\"k\":3,"
                + "\"hits\":[{\"documentId\":\"0190f0a0-0000-7000-8000-000000000401\",\"title\":\"Boiler manual\","
                + "\"sourceType\":\"NOTE\",\"createdAt\":\"2026-01-02T00:00:00Z\",\"snippet\":\"the <mark>warranty</mark> "
                + "runs 5 years &amp; covers parts\",\"score\":0.031}]}");

        JsonNode r = result(callTool(member("ann"), "ask_your_life_search", "{\"query\":\"boiler & warranty\",\"k\":3}"));

        JsonNode p = r.path("structuredContent").path("passages").get(0);
        assertThat(p.path("title").asString()).isEqualTo("Boiler manual");
        assertThat(p.path("passage").asString()).isEqualTo("the warranty runs 5 years & covers parts");
        assertThat(r.path("content").get(0).path("text").asString()).contains("Boiler manual");
        String query = service("ask-your-life").received().get(0).rawQuery();
        assertThat(URLDecoder.decode(query, StandardCharsets.UTF_8)).contains("q=boiler & warranty").contains("k=3");
        assertThat(query).doesNotContain("& warranty");   // the ampersand is encoded, not a parameter break
        // The audit keeps a hash of the query, never the query itself.
        ToolCallsRecord audit = lastAudit();
        assertThat(audit.getArgumentsHash()).hasSize(64).doesNotContain("boiler");
        assertThat(audit.getOutcome()).isEqualTo("OK");
    }

    @Test
    void searchWithoutAQueryIsBadInput() throws Exception {
        JsonNode rpc = callTool(member("ann"), "ask_your_life_search", "{\"k\":3}");
        assertThat(result(rpc).path("isError").asBoolean()).as(rpc.toString()).isTrue();
        assertThat(service("ask-your-life").received()).isEmpty();
        assertThat(lastAudit().getOutcome()).isEqualTo("INVALID");
    }

    @Test
    void searchWithAnUnknownArgumentIsBadInput() throws Exception {
        JsonNode rpc = callTool(member("ann"), "ask_your_life_search", "{\"query\":\"x\",\"ownerUid\":\"bob\"}");
        assertThat(result(rpc).path("isError").asBoolean()).as(rpc.toString()).isTrue();
        assertThat(service("ask-your-life").received()).isEmpty();
        assertThat(lastAudit().getOutcome()).isEqualTo("INVALID");
    }

    // ---- home_pulse_appliance_status -------------------------------------------------------------------------

    @Test
    void applianceStatusCombinesHealthAndOpenAlerts() throws Exception {
        service("home-pulse")
                .reply("/v1/appliances", 200, "[{\"id\":\"" + APPLIANCE + "\",\"name\":\"Fridge\",\"type\":\"FRIDGE\","
                        + "\"location\":\"Kitchen\",\"underWarranty\":true,\"serviceOverdue\":false}]")
                .reply("/v1/appliances/" + APPLIANCE + "/health", 200, "{\"applianceId\":\"" + APPLIANCE + "\","
                        + "\"status\":\"WARNING\",\"lastReadingAt\":\"2026-11-26T08:00:00Z\",\"activeAlerts\":[{\"id\":"
                        + "\"0190f0a0-0000-7000-8000-000000000501\",\"kind\":\"DUTY_CYCLE\",\"severity\":\"WARNING\","
                        + "\"status\":\"OPEN\",\"message\":\"Compressor runs longer than usual\",\"openedAt\":\"2026-11-25T00:00:00Z\"}]}");

        JsonNode r = result(callTool(member("ann"), "home_pulse_appliance_status", "{}"));

        JsonNode a = r.path("structuredContent").path("appliances").get(0);
        assertThat(a.path("name").asString()).isEqualTo("Fridge");
        assertThat(a.path("health").asString()).isEqualTo("WARNING");
        assertThat(a.path("openAlerts").get(0).path("message").asString()).contains("Compressor");
        assertThat(r.path("content").get(0).path("text").asString()).contains("Fridge: WARNING");
    }

    @Test
    void applianceStatusRejectsAMalformedId() throws Exception {
        JsonNode rpc = callTool(member("ann"), "home_pulse_appliance_status", "{\"applianceId\":\"../../v1/alerts\"}");
        assertThat(result(rpc).path("isError").asBoolean()).as(rpc.toString()).isTrue();
        assertThat(service("home-pulse").received()).isEmpty();
    }

    @Test
    void anApplianceTheServiceDoesNotFindIsAToolError() throws Exception {
        assertToolError(callTool(member("ann"), "home_pulse_appliance_status", "{\"applianceId\":\"" + APPLIANCE + "\"}"),
                "not_found");
        assertThat(lastAudit().getOutcome()).isEqualTo("INVALID");
    }

    // ---- family_treasury_ledger_summary ----------------------------------------------------------------------

    @Test
    void ledgerSummaryListsBalancesPerAccountInMajorUnits() throws Exception {
        service("family-treasury")
                .reply("/v1/households", 200, "[{\"id\":\"" + HOUSEHOLD + "\",\"name\":\"Home\",\"currency\":\"EUR\","
                        + "\"members\":[],\"accounts\":[]}]")
                .reply("/v1/households/" + HOUSEHOLD + "/accounts", 200, "[{\"id\":\"0190f0a0-0000-7000-8000-000000000601\","
                        + "\"code\":\"POOL\",\"name\":\"Family pool\",\"type\":\"ASSET\",\"currency\":\"EUR\","
                        + "\"balanceMinor\":123456,\"rawBalanceMinor\":123456},{\"id\":\"0190f0a0-0000-7000-8000-000000000602\","
                        + "\"code\":\"POT-1\",\"name\":\"Ann's pot\",\"type\":\"ASSET\",\"currency\":\"JPY\",\"balanceMinor\":500}]");

        JsonNode r = result(callTool(member("ann"), "family_treasury_ledger_summary", "{}"));

        JsonNode accounts = r.path("structuredContent").path("households").get(0).path("accounts");
        assertThat(accounts.get(0).path("balance").asString()).isEqualTo("1234.56");
        assertThat(accounts.get(0).path("balanceMinor").asLong()).isEqualTo(123456);
        assertThat(accounts.get(1).path("balance").asString()).isEqualTo("500");
        assertThat(r.path("content").get(0).path("text").asString()).contains("Family pool").contains("1234.56 EUR");
    }

    @Test
    void aHouseholdTheCallerIsNotInIsRefusedByTreasuryAndThatIsAToolError() throws Exception {
        service("family-treasury").reply("/v1/households/" + HOUSEHOLD, 403, "{\"title\":\"Forbidden\"}");
        JsonNode rpc = callTool(member("ann"), "family_treasury_ledger_summary", "{\"householdId\":\"" + HOUSEHOLD + "\"}");
        assertToolError(rpc, "downstream_denied");
        assertThat(rpc.path("result").path("structuredContent").has("households")).isFalse();
        assertThat(lastAudit().getOutcome()).isEqualTo("DENIED");
    }

    @Test
    void aServiceThatIsDownIsAToolErrorNotAnException() throws Exception {
        service("family-treasury").reply("/v1/households", 500, "{}");
        assertToolError(callTool(member("ann"), "family_treasury_ledger_summary", "{}"), "unavailable");
        assertThat(lastAudit().getOutcome()).isEqualTo("ERROR");
    }

    // ---- consent scoping -------------------------------------------------------------------------------------

    @Test
    void everyToolRefusesACallerWithoutProductsUseAndCallsNoService() throws Exception {
        String noProducts = person("bob", "mcp:use", "usage:read:self");
        String[][] calls = {
                {"waiting_on_list_followups", "{}"},
                {"ask_your_life_search", "{\"query\":\"tax\"}"},
                {"home_pulse_appliance_status", "{}"},
                {"family_treasury_ledger_summary", "{}"}};
        for (String[] call : calls) {
            JsonNode rpc = callTool(noProducts, call[0], call[1]);
            assertToolError(rpc, "forbidden");
            assertThat(rpc.path("result").path("structuredContent").path("error").path("requiredPermission").asString())
                    .isEqualTo("products:use");
            ToolCallsRecord audit = lastAudit();
            assertThat(audit.getTool()).isEqualTo(call[0]);
            assertThat(audit.getOutcome()).isEqualTo("DENIED");
            assertThat(audit.getErrorCode()).isEqualTo("forbidden");
            assertThat(audit.getPrincipalId()).isEqualTo("bob");
        }
        SERVICES.values().forEach(s -> assertThat(s.received()).isEmpty());
    }

    @Test
    void anApiKeyIsRefusedEvenWithProductsUseBecauseItDoesNotActAsItsOwner() throws Exception {
        String key = apiKey("0190f0a0-0000-7000-8000-0000000000bb", "mcp:use", "products:use");
        assertToolError(callTool(key, "waiting_on_list_followups", "{}"), "api_key_not_supported");
        ToolCallsRecord audit = lastAudit();
        assertThat(audit.getPrincipalType()).isEqualTo("API_KEY");
        assertThat(audit.getPrincipalId()).isEqualTo("app:0190f0a0-0000-7000-8000-0000000000bb");
        assertThat(audit.getOutcome()).isEqualTo("DENIED");
        assertThat(service("waiting-on").received()).isEmpty();

        String keyWithoutProducts = apiKey("0190f0a0-0000-7000-8000-0000000000bc", "mcp:use");
        assertToolError(callTool(keyWithoutProducts, "ask_your_life_search", "{\"query\":\"x\"}"), "forbidden");
    }

    @Test
    void everyToolsCallWritesExactlyOneAuditRow() throws Exception {
        service("home-pulse").reply("/v1/appliances", 200, "[]");
        int before = auditRows();
        callTool(member("ann"), "home_pulse_appliance_status", "{}");
        callTool(member("ann"), "ask_your_life_search", "{}");
        callTool(member("ann"), "no_such_tool", "{}");
        rpc(member("ann"), "tools/list", "{}");   // not a tool call: not audited
        rpc(member("ann"), "ping", null);
        assertThat(auditRows()).isEqualTo(before + 3);
    }
}
