package com.personalplatform.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.gateway.config.GatewayProperties;
import com.personalplatform.gateway.support.Backends;
import com.personalplatform.gateway.support.GatewayTestBase;
import com.personalplatform.gateway.support.StubServer.Reply;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;

class RoutingTest extends GatewayTestBase {

    static java.util.stream.Stream<String> services() {
        return Backends.SERVICES.stream();
    }

    @ParameterizedTest
    @MethodSource("services")
    void eachServicePrefixIsStrippedAndProxiedToItsOwnBackend(String service) {
        client.post().uri("/api/" + service + "/v1/things/123?x=1&y=two")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER))
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue("{\"hello\":\"world\"}")
                .exchange()
                .expectStatus().isOk()
                .expectHeader().valueEquals("X-Backend", service);

        var received = backends.service(service).received();
        // the auth backend also receives the exchange call, the platform backend the plans refresh
        var proxied = received.stream().filter(r -> r.path().startsWith("/v1/things")).toList();
        assertThat(proxied).hasSize(1);
        assertThat(proxied.get(0).method()).isEqualTo("POST");
        assertThat(proxied.get(0).path()).isEqualTo("/v1/things/123?x=1&y=two");
        assertThat(proxied.get(0).body()).isEqualTo("{\"hello\":\"world\"}");
    }

    @Test
    void unknownServicePrefixAndNonApiPathsAreNotFound() {
        client.get().uri("/api/nope/v1/things").header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER))
                .exchange().expectStatus().isNotFound();
        client.get().uri("/v1/things").header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER))
                .exchange().expectStatus().isNotFound();
        assertThat(backends.downstreamRequests()).isZero();
    }

    @Test
    void anOverlongBearerCredentialIsRejectedWithoutCallingTheExchange() {
        client.get().uri("/api/waiting-on/v1/items")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + "a".repeat(5000))
                .exchange().expectStatus().isUnauthorized();
        assertThat(backends.exchangeCalls()).isZero();
    }

    @Test
    void corsPreflightFromAKnownOriginSucceeds() {
        client.options().uri("/api/waiting-on/v1/items")
                .header(HttpHeaders.ORIGIN, "http://localhost:5181")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization,content-type")
                .exchange()
                .expectStatus().isOk()
                .expectHeader().valueEquals(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5181")
                .expectHeader().value(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS, v -> assertThat(v).contains("POST"));

        // answered by the gateway itself: no credential needed, nothing forwarded, no exchange
        assertThat(backends.downstreamRequests()).isZero();
        assertThat(backends.exchangeCalls()).isZero();
    }

    @Test
    void corsPreflightFromAnUnknownOriginIsRejected() {
        client.options().uri("/api/waiting-on/v1/items")
                .header(HttpHeaders.ORIGIN, "http://evil.example")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                .exchange()
                .expectStatus().isForbidden()
                .expectHeader().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN);
        assertThat(backends.downstreamRequests()).isZero();
    }

    @Test
    void actualResponsesCarryOneCorsHeaderEvenWhenTheServiceAddsItsOwn() {
        backends.service("waiting-on").handler(r -> new Reply(200,
                Map.of("Content-Type", "application/json", "Access-Control-Allow-Origin", "*"), "{}"));

        var response = client.method(HttpMethod.GET).uri("/api/waiting-on/v1/items")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER))
                .header(HttpHeaders.ORIGIN, "http://localhost:5181")
                .exchange()
                .expectStatus().isOk()
                .returnResult(String.class);

        assertThat(response.getResponseHeaders().get(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN))
                .containsExactly("http://localhost:5181");
    }

    @Test
    void defaultsPointEveryServiceAtItsLocalPortAndOnlyProductRoutesNeedProductsUse() {
        GatewayProperties defaults = GatewayProperties.defaults();
        assertThat(defaults.services().get("auth").uri()).isEqualTo("http://localhost:8081");
        assertThat(defaults.services().get("shared").uri()).isEqualTo("http://localhost:8082");
        assertThat(defaults.services().get("waiting-on").uri()).isEqualTo("http://localhost:8083");
        assertThat(defaults.services().get("consent").uri()).isEqualTo("http://localhost:8084");
        assertThat(defaults.services().get("home-pulse").uri()).isEqualTo("http://localhost:8085");
        assertThat(defaults.services().get("ask-your-life").uri()).isEqualTo("http://localhost:8086");
        assertThat(defaults.services().get("digital-legacy").uri()).isEqualTo("http://localhost:8087");
        assertThat(defaults.services().get("family-treasury").uri()).isEqualTo("http://localhost:8088");
        assertThat(defaults.services().get("platform").uri()).isEqualTo("http://localhost:8089");
        for (String product : new String[] {"waiting-on", "consent", "home-pulse", "ask-your-life", "digital-legacy",
                "family-treasury"}) {
            assertThat(defaults.requiredPermission(product)).contains("products:use");
        }
        for (String open : new String[] {"auth", "shared", "platform"}) {
            assertThat(defaults.requiredPermission(open)).isEmpty();
        }
    }
}
