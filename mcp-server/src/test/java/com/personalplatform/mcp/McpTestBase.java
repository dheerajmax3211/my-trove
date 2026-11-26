package com.personalplatform.mcp;

import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

import com.personalplatform.security.testing.PlatformTestTokens;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import org.jooq.DSLContext;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The real server on a random port (the MCP endpoint is a servlet, which MockMvc cannot reach), real Postgres for the
 * audit, platform tokens signed by a throwaway key, and one HTTP stub per product service.
 */
@SpringBootTest(webEnvironment = RANDOM_PORT, properties = "management.server.port=0")
@Import(McpTestBase.TestSupport.class)
abstract class McpTestBase {

    static final PlatformTestTokens TOKENS = PlatformTestTokens.create();
    static final Map<String, StubService> SERVICES = Map.of(
            "waiting-on", StubService.start(),
            "ask-your-life", StubService.start(),
            "home-pulse", StubService.start(),
            "family-treasury", StubService.start());
    static final JsonMapper JSON = JsonMapper.builder().build();

    @TestConfiguration(proxyBeanMethods = false)
    static class TestSupport {

        @Bean
        @ServiceConnection
        PostgreSQLContainer postgresContainer() {
            return new PostgreSQLContainer(DockerImageName.parse("postgres:16"));
        }

        @Bean
        JwtDecoder jwtDecoder() {
            return TOKENS.decoder();
        }
    }

    @DynamicPropertySource
    static void services(DynamicPropertyRegistry r) {
        SERVICES.forEach((name, stub) -> r.add("app.mcp.services." + name, stub::uri));
    }

    @LocalServerPort int port;
    @Autowired DSLContext dsl;

    final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void resetStubs() {
        SERVICES.values().forEach(StubService::reset);
    }

    static StubService service(String name) {
        return SERVICES.get(name);
    }

    /** A person's platform token (MEMBER-like by default plus mcp:use). */
    static String person(String uid, String... permissions) {
        return TOKENS.platformToken(uid).uid(java.util.UUID.randomUUID()).roles("DEVELOPER").permissions(permissions)
                .build();
    }

    static String member(String uid) {
        return person(uid, "products:use", "usage:read:self", "connections:manage", "mcp:use");
    }

    /** An API key's service token. */
    static String apiKey(String appId, String... permissions) {
        return TOKENS.serviceToken(appId).permissions(permissions).scopes("mcp:use").build();
    }

    HttpResponse<String> post(String token, String body) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/mcp"))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json, text/event-stream")
                .POST(HttpRequest.BodyPublishers.ofString(body));
        if (token != null) {
            b.header("Authorization", "Bearer " + token);
        }
        return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    /** POSTs one JSON-RPC request and returns the parsed response (asserting HTTP 200). */
    JsonNode rpc(String token, String method, String paramsJson) throws Exception {
        String body = "{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"" + method + "\""
                + (paramsJson == null ? "" : ",\"params\":" + paramsJson) + "}";
        HttpResponse<String> response = post(token, body);
        if (response.statusCode() != 200) {
            throw new AssertionError("HTTP " + response.statusCode() + ": " + response.body());
        }
        return JSON.readTree(response.body());
    }

    JsonNode callTool(String token, String tool, String argumentsJson) throws Exception {
        return rpc(token, "tools/call", "{\"name\":\"" + tool + "\",\"arguments\":" + argumentsJson + "}");
    }

    int auditRows() {
        return dsl.fetchCount(com.personalplatform.sql.jooq.mcp.mcp.Tables.TOOL_CALLS);
    }
}
