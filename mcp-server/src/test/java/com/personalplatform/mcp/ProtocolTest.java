package com.personalplatform.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

/** The MCP surface itself: initialize, ping, tools/list, unknown tool, transport rules and endpoint auth. */
class ProtocolTest extends McpTestBase {

    static final String INIT_PARAMS = "{\"protocolVersion\":\"2025-06-18\",\"capabilities\":{},"
            + "\"clientInfo\":{\"name\":\"test-client\",\"version\":\"1.0\"}}";

    @Test
    void initializeAnswersWithServerInfoToolsCapabilityAndTheRequestedProtocolVersion() throws Exception {
        JsonNode r = rpc(member("ann"), "initialize", INIT_PARAMS);
        assertThat(r.path("id").asInt()).isEqualTo(7);
        JsonNode result = r.path("result");
        assertThat(result.path("protocolVersion").asString()).isEqualTo("2025-06-18");
        assertThat(result.path("serverInfo").path("name").asString()).isEqualTo("my-trove");
        assertThat(result.path("capabilities").has("tools")).isTrue();
        assertThat(result.path("instructions").asString()).contains("audited");
    }

    @Test
    void initializeWithTheNewestVersionTheSdkKnowsIsAccepted() throws Exception {
        JsonNode r = rpc(member("ann"), "initialize", INIT_PARAMS.replace("2025-06-18", "2025-11-25"));
        assertThat(r.path("result").path("protocolVersion").asString()).isEqualTo("2025-11-25");
    }

    @Test
    void initializedNotificationIsAcceptedWithoutABody() throws Exception {
        HttpResponse<String> r = post(member("ann"), "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}");
        assertThat(r.statusCode()).isEqualTo(202);
    }

    @Test
    void pingAnswersAnEmptyResult() throws Exception {
        JsonNode r = rpc(member("ann"), "ping", null);
        assertThat(r.has("error")).isFalse();
        assertThat(r.path("result").isObject()).isTrue();
    }

    @Test
    void toolsListDescribesTheFourReadOnlyToolsWithStrictInputSchemas() throws Exception {
        JsonNode tools = rpc(member("ann"), "tools/list", "{}").path("result").path("tools");
        List<String> names = new ArrayList<>();
        tools.forEach(t -> names.add(t.path("name").asString()));
        assertThat(names).containsExactlyInAnyOrder("waiting_on_list_followups", "ask_your_life_search",
                "home_pulse_appliance_status", "family_treasury_ledger_summary");
        for (JsonNode t : tools) {
            assertThat(t.path("description").asString()).isNotBlank();
            assertThat(t.path("inputSchema").path("type").asString()).isEqualTo("object");
            assertThat(t.path("inputSchema").path("additionalProperties").asBoolean(true)).isFalse();
            assertThat(t.path("annotations").path("readOnlyHint").asBoolean()).isTrue();
            assertThat(t.path("annotations").path("destructiveHint").asBoolean(true)).isFalse();
        }
        JsonNode search = find(tools, "ask_your_life_search").path("inputSchema");
        assertThat(search.path("required").get(0).asString()).isEqualTo("query");
        assertThat(search.path("properties").path("query").path("maxLength").asInt()).isEqualTo(500);
        assertThat(search.path("properties").path("k").path("maximum").asInt()).isEqualTo(10);
        JsonNode followups = find(tools, "waiting_on_list_followups").path("inputSchema");
        assertThat(followups.path("properties").path("limit").path("maximum").asInt()).isEqualTo(20);
        assertThat(find(tools, "family_treasury_ledger_summary").path("inputSchema").path("properties")
                .path("householdId").path("format").asString()).isEqualTo("uuid");
    }

    @Test
    void anUnknownToolIsAJsonRpcErrorAndIsAudited() throws Exception {
        int before = auditRows();
        JsonNode r = callTool(member("ann"), "delete_everything", "{}");
        assertThat(r.has("error")).as(r.toString()).isTrue();
        assertThat(r.has("result")).isFalse();
        assertThat(auditRows()).isEqualTo(before + 1);
        var row = dsl.selectFrom(com.personalplatform.sql.jooq.mcp.mcp.Tables.TOOL_CALLS)
                .orderBy(com.personalplatform.sql.jooq.mcp.mcp.Tables.TOOL_CALLS.ID.desc()).limit(1).fetchOne();
        assertThat(row.getTool()).isEqualTo("delete_everything");
        assertThat(row.getOutcome()).isEqualTo("UNKNOWN_TOOL");
    }

    @Test
    void anUnknownMethodIsAJsonRpcError() throws Exception {
        JsonNode r = rpc(member("ann"), "resources/delete", "{}");
        assertThat(r.path("error").path("code").asInt()).isEqualTo(-32601);
    }

    @Test
    void getIsNotAnEventStreamHere() throws Exception {
        HttpResponse<String> r = http.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/mcp"))
                .header("Authorization", "Bearer " + member("ann"))
                .header("Accept", "text/event-stream").GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(r.statusCode()).isEqualTo(405);
    }

    @Test
    void theEndpointNeedsAPlatformTokenWithMcpUse() throws Exception {
        String ping = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}";
        assertThat(post(null, ping).statusCode()).isEqualTo(401);
        assertThat(post(person("bob", "products:use"), ping).statusCode()).isEqualTo(403);
        // A token signed by another key, and an unsigned one, are refused outright.
        String foreign = com.personalplatform.security.testing.PlatformTestTokens.create().platformToken("eve")
                .permissions("mcp:use", "products:use").build();
        assertThat(post(foreign, ping).statusCode()).isEqualTo(401);
        assertThat(post(TOKENS.platformToken("eve").permissions("mcp:use").buildUnsigned(), ping).statusCode())
                .isEqualTo(401);
        assertThat(post(member("ann"), ping).statusCode()).isEqualTo(200);
    }

    @Test
    void anApiKeyWithMcpUseCanConnectAndListTools() throws Exception {
        String key = apiKey("0190f0a0-0000-7000-8000-0000000000aa", "mcp:use");
        assertThat(rpc(key, "initialize", INIT_PARAMS).path("result").path("serverInfo").path("name").asString())
                .isEqualTo("my-trove");
        assertThat(rpc(key, "tools/list", "{}").path("result").path("tools").size()).isEqualTo(4);
    }

    @Test
    void otherPathsOnTheMainPortAreClosed() throws Exception {
        HttpResponse<String> r = http.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/v1/anything"))
                .header("Authorization", "Bearer " + member("ann")).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(r.statusCode()).isIn(403, 404);
    }

    private static JsonNode find(JsonNode tools, String name) {
        for (JsonNode t : tools) {
            if (t.path("name").asString().equals(name)) {
                return t;
            }
        }
        throw new AssertionError("no tool " + name);
    }
}
