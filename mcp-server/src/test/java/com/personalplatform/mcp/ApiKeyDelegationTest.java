package com.personalplatform.mcp;

import static com.personalplatform.sql.jooq.mcp.mcp.Tables.TOOL_CALLS;
import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.sql.jooq.mcp.mcp.tables.records.ToolCallsRecord;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/**
 * An API key acts for its owner (brief 86): the key's service token is traded at auth for a delegated token for the
 * owner, and the product services are called with that token, exactly as for a person. auth is a stub here (its own
 * tests cover the intersection and refusals); the delegated token is signed by the same test key as every token.
 */
class ApiKeyDelegationTest extends McpTestBase {

    static final String APP = "0190f0a0-0000-7000-8000-0000000000bb";
    static final String ITEM = "0190f0a0-0000-7000-8000-000000000101";

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
    }

    private void waitingOnHasOneItem() {
        service("waiting-on")
                .reply("/v1/items", 200, "[{\"id\":\"" + ITEM + "\",\"title\":\"Laptop refund\",\"counterparty\":\"Shop\","
                        + "\"status\":\"OPEN\",\"expectedBy\":\"2026-12-01\",\"amount\":null,\"currency\":null}]")
                .reply("/v1/items/" + ITEM, 200, "{\"id\":\"" + ITEM + "\",\"followUp\":{\"stage\":\"OPEN\","
                        + "\"nextAction\":\"NUDGE\",\"nextActionAt\":\"2026-12-02T09:00:00Z\",\"snoozedDays\":0}}");
    }

    @Test
    void aKeyWithTheProductScopeReadsItsOwnersDataThroughADelegatedToken() throws Exception {
        String key = apiKey(APP, "mcp:use", "products:use");
        String delegated = delegatedToken(APP, "mcp:use", "products:use");
        authDelegates(delegated);
        waitingOnHasOneItem();

        JsonNode r = result(callTool(key, "waiting_on_list_followups", "{\"limit\":5}"));

        assertThat(r.path("isError").asBoolean()).as(r.toString()).isFalse();
        assertThat(r.path("structuredContent").path("items").get(0).path("title").asString()).isEqualTo("Laptop refund");

        var asked = AUTH.received();
        assertThat(asked).hasSize(1);
        assertThat(asked.get(0).method()).isEqualTo("POST");
        assertThat(asked.get(0).path()).isEqualTo("/internal/v1/token/delegate");
        assertThat(asked.get(0).internalKey()).isEqualTo(INTERNAL_KEY);
        assertThat(asked.get(0).body()).contains(key);
        assertThat(asked.get(0).authorization()).as("the key's token goes in the body, never as a bearer").isNull();

        assertThat(service("waiting-on").received()).isNotEmpty().allSatisfy(x -> assertThat(x.authorization())
                .as("products see the owner's delegated token, never the key's service token")
                .isEqualTo("Bearer " + delegated));

        ToolCallsRecord audit = lastAudit();
        assertThat(audit.getPrincipalType()).isEqualTo("API_KEY");
        assertThat(audit.getPrincipalId()).isEqualTo("app:" + APP);
        assertThat(audit.getOnBehalfOf()).isEqualTo(KEY_OWNER);
        assertThat(audit.getOutcome()).isEqualTo("OK");
    }

    @Test
    void aKeyWithoutTheProductPermissionIsRefusedWithoutAskingAuth() throws Exception {
        String key = apiKey(APP, "mcp:use", "usage:read:self");
        authDelegates(delegatedToken(APP, "products:use"));
        JsonNode rpc = callTool(key, "ask_your_life_search", "{\"query\":\"x\"}");
        assertToolError(rpc, "forbidden");
        assertThat(AUTH.received()).isEmpty();
        SERVICES.values().forEach(s -> assertThat(s.received()).isEmpty());
        ToolCallsRecord audit = lastAudit();
        assertThat(audit.getOutcome()).isEqualTo("DENIED");
        assertThat(audit.getOnBehalfOf()).isEqualTo(KEY_OWNER);
    }

    @Test
    void anOwnerWhoLacksThePermissionIsRefusedEvenIfTheKeyHasIt() throws Exception {
        String key = apiKey(APP, "mcp:use", "products:use");
        authDelegates(delegatedToken(APP, "mcp:use"));   // the intersection left products:use out
        JsonNode rpc = callTool(key, "home_pulse_appliance_status", "{}");
        assertToolError(rpc, "forbidden");
        assertThat(rpc.path("result").path("structuredContent").path("error").path("requiredPermission").asString())
                .isEqualTo("products:use");
        assertThat(service("home-pulse").received()).isEmpty();
    }

    @Test
    void authsRefusalIsADeniedToolErrorWithItsReason() throws Exception {
        String key = apiKey(APP, "mcp:use", "products:use");
        AUTH.reply("/internal/v1/token/delegate", 403,
                "{\"status\":403,\"code\":\"USER_SUSPENDED\",\"detail\":\"The API key's owner is suspended\"}");
        JsonNode rpc = callTool(key, "family_treasury_ledger_summary", "{}");
        assertToolError(rpc, "delegation_refused");
        assertThat(rpc.path("result").path("structuredContent").path("error").path("reason").asString())
                .isEqualTo("USER_SUSPENDED");
        assertThat(service("family-treasury").received()).isEmpty();
        ToolCallsRecord audit = lastAudit();
        assertThat(audit.getOutcome()).isEqualTo("DENIED");
        assertThat(audit.getErrorCode()).isEqualTo("delegation_refused");
        assertThat(audit.getPrincipalId()).isEqualTo("app:" + APP);
        assertThat(audit.getOnBehalfOf()).isEqualTo(KEY_OWNER);
    }

    @Test
    void anAuthOutageIsUnavailableNotARefusal() throws Exception {
        String key = apiKey(APP, "mcp:use", "products:use");
        AUTH.reply("/internal/v1/token/delegate", 503, "{\"code\":\"API_KEY_SERVICE_UNAVAILABLE\"}");
        assertToolError(callTool(key, "home_pulse_appliance_status", "{}"), "unavailable");
        assertThat(service("home-pulse").received()).isEmpty();
    }

    @Test
    void aDelegatedTokenThatDoesNotVerifyOrActsForAnotherAppIsNeverUsed() throws Exception {
        String key = apiKey(APP, "mcp:use", "products:use");
        authDelegates(delegatedToken("0190f0a0-0000-7000-8000-0000000000ff", "products:use"));
        assertToolError(callTool(key, "home_pulse_appliance_status", "{}"), "unavailable");

        authDelegates(TOKENS.serviceToken(APP).permissions("products:use")
                .claim("act", java.util.Map.of("sub", "app:" + APP)).build());
        assertToolError(callTool(key, "home_pulse_appliance_status", "{}"), "unavailable");

        authDelegates("not-a-jwt");
        assertToolError(callTool(key, "home_pulse_appliance_status", "{}"), "unavailable");
        assertThat(service("home-pulse").received()).isEmpty();
    }

    @Test
    void everyToolCallDelegatesAfreshSoARevocationTakesEffectAtOnce() throws Exception {
        String key = apiKey(APP, "mcp:use", "products:use");
        authDelegates(delegatedToken(APP, "products:use"));
        service("home-pulse").reply("/v1/appliances", 200, "[]");
        assertThat(result(callTool(key, "home_pulse_appliance_status", "{}")).path("isError").asBoolean()).isFalse();

        AUTH.reply("/internal/v1/token/delegate", 403, "{\"code\":\"API_KEY_REVOKED\"}");
        assertToolError(callTool(key, "home_pulse_appliance_status", "{}"), "delegation_refused");
        assertThat(AUTH.received()).hasSize(2);
    }
}
