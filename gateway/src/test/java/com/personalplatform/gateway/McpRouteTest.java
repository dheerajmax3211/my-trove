package com.personalplatform.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.gateway.support.Backends;
import com.personalplatform.gateway.support.GatewayTestBase;
import com.personalplatform.gateway.support.StubServer.Received;
import com.personalplatform.gateway.support.TestJwt;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/**
 * Brief 82: {@code /api/mcp/**} goes to mcp-server with the prefix stripped. People need {@code mcp:use}; an API key
 * may reach {@code POST /mcp} only, and only when its token carries {@code mcp:use}.
 */
class McpRouteTest extends GatewayTestBase {

    static final String INIT = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}";
    static final String MCP_KEY = "svc|0190f0a0-0000-7000-8000-0000000000d1|FREE|mcp:use";
    static final String USAGE_KEY = "svc|0190f0a0-0000-7000-8000-0000000000d2|FREE|usage:read:self";

    private long mcpCalls() {
        return backends.service("mcp").received().size();
    }

    @Test
    void aUserWithMcpUseIsForwardedToTheMcpEndpointWithAPlatformToken() {
        client.post().uri("/api/mcp/mcp")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.MCP_USER))
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(INIT)
                .exchange()
                .expectStatus().isOk()
                .expectHeader().valueEquals("X-Backend", "mcp");

        Received r = backends.service("mcp").received().get(0);
        assertThat(r.path()).isEqualTo("/mcp");
        assertThat(r.body()).isEqualTo(INIT);
        Map<String, Object> claims = TestJwt.claims(r.header("authorization").substring("Bearer ".length()));
        assertThat(claims).containsEntry("token_use", "platform").containsEntry("sub", "firebase-dave");
    }

    @Test
    void aMemberWithoutMcpUseIsForbiddenAndNothingIsForwarded() {
        client.post().uri("/api/mcp/mcp")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER))
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(INIT)
                .exchange()
                .expectStatus().isForbidden()
                .expectBody().jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("mcp:use"));
        assertThat(mcpCalls()).isZero();
    }

    @Test
    void anApiKeyWithMcpUseReachesPostMcpWithItsServiceToken() {
        client.post().uri("/api/mcp/mcp")
                .header(HttpHeaders.AUTHORIZATION, bearer(MCP_KEY))
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(INIT)
                .exchange()
                .expectStatus().isOk();
        Received r = backends.service("mcp").received().get(0);
        assertThat(r.path()).isEqualTo("/mcp");
        assertThat(TestJwt.claims(r.header("authorization").substring("Bearer ".length())))
                .containsEntry("token_use", "service");
    }

    @Test
    void anApiKeyIsRefusedWithoutMcpUseOrOnAnyOtherMcpRoute() {
        client.post().uri("/api/mcp/mcp")
                .header(HttpHeaders.AUTHORIZATION, bearer(USAGE_KEY))
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(INIT)
                .exchange()
                .expectStatus().isForbidden();
        client.get().uri("/api/mcp/mcp")
                .header(HttpHeaders.AUTHORIZATION, bearer(MCP_KEY))
                .exchange()
                .expectStatus().isForbidden();
        client.post().uri("/api/mcp/other")
                .header(HttpHeaders.AUTHORIZATION, bearer(MCP_KEY))
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(INIT)
                .exchange()
                .expectStatus().isForbidden();
        assertThat(mcpCalls()).isZero();
    }

    @Test
    void theMcpServersActuatorIsNotReachableThroughTheGateway() {
        client.get().uri("/api/mcp/actuator/prometheus")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.MCP_USER))
                .exchange()
                .expectStatus().isNotFound();
        assertThat(mcpCalls()).isZero();
    }
}
