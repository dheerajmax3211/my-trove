package com.personalplatform.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.gateway.support.GatewayTestBase;
import com.personalplatform.gateway.support.StubServer.Reply;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import org.junit.jupiter.api.Test;

/**
 * W4 item 6: the gateway lists each service's OpenAPI document and says which are there, and the platform document is
 * public (it is an API description, with no credentials in it), so a developer can read it without a token.
 */
class ApiDocsTest extends GatewayTestBase {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private static final String PLATFORM_DOC = "{\"openapi\":\"3.1.0\",\"paths\":{\"/v1/developer/apps\":{}}}";

    @Test
    void theIndexSaysWhichServicesPublishADocument() throws Exception {
        backends.platform().handler(r -> r.path().equals("/v3/api-docs") ? Reply.json(200, PLATFORM_DOC) : Reply.problem(404, "no"));

        String body = client.get().uri("/api/platform/v1/docs").exchange()
                .expectStatus().isOk()
                .expectBody(String.class).returnResult().getResponseBody();
        JsonNode services = JSON.readTree(body).path("services");

        JsonNode platform = find(services, "platform");
        assertThat(platform).as("platform is listed").isNotNull();
        assertThat(platform.path("available").asBoolean()).isTrue();
        assertThat(platform.path("docsPath").asString()).isEqualTo("/api/platform/v3/api-docs");

        JsonNode waitingOn = find(services, "waiting-on");
        assertThat(waitingOn).as("every configured service is listed").isNotNull();
        assertThat(waitingOn.path("available").asBoolean()).as("no document yet").isFalse();
    }

    @Test
    void thePlatformDocumentIsServedWithoutACredentialAndWithoutAnExchange() {
        backends.platform().handler(r -> r.path().equals("/v3/api-docs") ? Reply.json(200, PLATFORM_DOC) : Reply.problem(404, "no"));

        client.get().uri("/api/platform/v3/api-docs").exchange()
                .expectStatus().isOk();

        assertThat(backends.exchangeCalls()).isZero();
        assertThat(backends.platform().received().stream().anyMatch(r -> r.path().equals("/v3/api-docs"))).isTrue();
    }

    private static JsonNode find(JsonNode services, String name) {
        for (JsonNode s : services) {
            if (name.equals(s.path("name").asString())) {
                return s;
            }
        }
        return null;
    }
}
