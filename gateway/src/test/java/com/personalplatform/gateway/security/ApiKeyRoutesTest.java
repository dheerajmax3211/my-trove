package com.personalplatform.gateway.security;

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
 * W4 item 3: an API key's service token reaches only the routes listed in {@code gateway.api-key-routes}, and only
 * with the permission each route names. Everything else is refused at the gateway, deny by default.
 */
class ApiKeyRoutesTest extends GatewayTestBase {

    /** The stub's credential for a key: svc|appId|PLAN|permissions. */
    static final String USAGE_KEY = "svc|0190f0a0-0000-7000-8000-00000000000a|FREE|usage:read:self";
    static final String NO_USAGE_KEY = "svc|0190f0a0-0000-7000-8000-00000000000b|FREE|connections:manage";
    static final String ALL_PERMISSIONS_KEY =
            "svc|0190f0a0-0000-7000-8000-00000000000c|PRO|products:use,usage:read:self,usage:read:all,flags:manage";

    private static boolean forwardedTo(String path) {
        return backends.platform().received().stream().anyMatch(r -> r.path().equals(path));
    }

    @Test
    void aKeyWithTheRoutesPermissionReachesTheRouteWithItsOwnServiceToken() {
        client.get().uri("/api/platform/v1/usage/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(USAGE_KEY))
                .exchange()
                .expectStatus().isOk();

        // select by path: the plan refresh also calls this stub and may land last
        Received downstream = backends.platform().received().stream()
                .filter(r -> r.path().equals("/v1/usage/me")).reduce((a, b) -> b).orElseThrow();
        assertThat(downstream.path()).isEqualTo("/v1/usage/me");
        Map<String, Object> claims = TestJwt.claims(downstream.header("authorization").substring("Bearer ".length()));
        assertThat(claims)
                .containsEntry("token_use", "service")
                .containsEntry("sub", "app:0190f0a0-0000-7000-8000-00000000000a")
                .doesNotContainKey("uid");
    }

    @Test
    void aKeyWithoutTheRoutesPermissionIsForbiddenAndNothingIsForwarded() {
        client.get().uri("/api/platform/v1/usage/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(NO_USAGE_KEY))
                .exchange()
                .expectStatus().isForbidden()
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("usage:read:self"));

        assertThat(forwardedTo("/v1/usage/me")).isFalse();
    }

    @Test
    void routesNotListedForKeysAreForbiddenEvenForAKeyHoldingEveryPermission() {
        for (String uri : new String[] {
                "/api/platform/v1/usage/summary", "/api/platform/v1/flags", "/api/waiting-on/v1/items",
                "/api/shared/v1/households"}) {
            client.get().uri(uri)
                    .header(HttpHeaders.AUTHORIZATION, bearer(ALL_PERMISSIONS_KEY))
                    .exchange()
                    .expectStatus().isForbidden();
        }
        assertThat(backends.downstreamRequests()).isZero();
        assertThat(forwardedTo("/v1/usage/summary")).isFalse();
    }

    @Test
    void aKeyWithOnlyTheRoutesPermissionCannotReachOtherRoutes() {
        client.get().uri("/api/platform/v1/usage/summary")
                .header(HttpHeaders.AUTHORIZATION, bearer(USAGE_KEY))
                .exchange()
                .expectStatus().isForbidden();
        assertThat(forwardedTo("/v1/usage/summary")).isFalse();
    }
}
