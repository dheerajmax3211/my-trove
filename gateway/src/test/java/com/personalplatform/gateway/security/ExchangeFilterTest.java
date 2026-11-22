package com.personalplatform.gateway.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.gateway.support.Backends;
import com.personalplatform.gateway.support.GatewayTestBase;
import com.personalplatform.gateway.support.StubServer.Received;
import com.personalplatform.gateway.support.TestJwt;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@ExtendWith(OutputCaptureExtension.class)
class ExchangeFilterTest extends GatewayTestBase {

    @Test
    void exchangesTheCredentialAndForwardsThePlatformTokenWithARequestId() {
        var response = client.get().uri("/api/waiting-on/v1/items?status=open")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER))
                .exchange()
                .expectStatus().isOk()
                .expectHeader().exists("X-Request-Id")
                .returnResult(String.class);

        Received downstream = backends.service("waiting-on").last();
        assertThat(downstream.path()).isEqualTo("/v1/items?status=open");
        String authorization = downstream.header("authorization");
        assertThat(authorization).startsWith("Bearer ").isNotEqualTo(bearer(Backends.MEMBER));
        Map<String, Object> claims = TestJwt.claims(authorization.substring("Bearer ".length()));
        assertThat(claims).containsEntry("uid", "alice").containsEntry("plan", "FREE");
        assertThat(downstream.header("x-request-id"))
                .isNotBlank()
                .isEqualTo(response.getResponseHeaders().getFirst("X-Request-Id"));
        assertThat(backends.exchangeCalls()).isEqualTo(1);
        // the exchange received the original credential
        assertThat(backends.auth().received().get(0).header("authorization")).isEqualTo(bearer(Backends.MEMBER));
    }

    @Test
    void missingCredentialOnAnAuthenticatedRouteIsAnUnauthorizedProblemAndNothingIsForwarded() {
        client.get().uri("/api/home-pulse/v1/devices")
                .exchange()
                .expectStatus().isUnauthorized()
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectHeader().valueEquals(HttpHeaders.WWW_AUTHENTICATE, "Bearer")
                .expectBody()
                .jsonPath("$.status").isEqualTo(401)
                .jsonPath("$.title").exists();

        assertThat(backends.downstreamRequests()).isZero();
        assertThat(backends.exchangeCalls()).isZero();
    }

    @Test
    void nonBearerAuthorizationIsRejectedWithoutCallingTheExchange() {
        client.get().uri("/api/home-pulse/v1/devices")
                .header(HttpHeaders.AUTHORIZATION, "Basic dXNlcjpwYXNz")
                .exchange()
                .expectStatus().isUnauthorized();

        assertThat(backends.exchangeCalls()).isZero();
        assertThat(backends.downstreamRequests()).isZero();
    }

    @Test
    void suspendedUserGetsForbiddenFromTheExchangeAndNothingIsForwarded() {
        client.get().uri("/api/waiting-on/v1/items")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.SUSPENDED))
                .exchange()
                .expectStatus().isForbidden()
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.title").isEqualTo("Account suspended");

        assertThat(backends.downstreamRequests()).isZero();
        assertThat(backends.exchangeCalls()).isEqualTo(1);
    }

    @Test
    void rejectedCredentialRelaysTheExchangeProblemAndNothingIsForwarded() {
        client.get().uri("/api/waiting-on/v1/items")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.UNAUTHORIZED))
                .exchange()
                .expectStatus().isUnauthorized()
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);

        assertThat(backends.downstreamRequests()).isZero();
    }

    @Test
    void exchangeOutageIsABadGatewayAndNothingIsForwarded() {
        client.get().uri("/api/waiting-on/v1/items")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.BOOM))
                .exchange()
                .expectStatus().isEqualTo(502)
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);

        assertThat(backends.downstreamRequests()).isZero();
    }

    @Test
    void productRouteWithoutProductsUseIsForbiddenAndNothingIsForwarded() {
        client.get().uri("/api/family-treasury/v1/accounts")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.NO_PRODUCTS))
                .exchange()
                .expectStatus().isForbidden()
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectBody()
                .jsonPath("$.detail").value(d -> assertThat((String) d).contains("products:use"));

        assertThat(backends.downstreamRequests()).isZero();
    }

    @ParameterizedTest
    @CsvSource({"auth", "shared", "platform"})
    void routesWithoutARequiredPermissionAcceptAnyAuthenticatedUser(String service) {
        client.get().uri("/api/" + service + "/v1/ping")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.NO_PRODUCTS))
                .exchange()
                .expectStatus().isOk();

        // select by path: the plan refresh also calls this stub, without a credential, and may land last
        var forwarded = backends.service(service).received().stream().filter(r -> r.path().equals("/v1/ping")).reduce((a, b) -> b);
        assertThat(forwarded).isPresent();
        assertThat(forwarded.get().header("authorization")).startsWith("Bearer ey");
    }

    @Test
    void serviceTokensAreAcceptedWithoutAUserId() {
        client.get().uri("/api/consent/v1/gateway-like")
                .header(HttpHeaders.AUTHORIZATION, bearer("svc|reports|PRO"))
                .exchange()
                // service tokens carry scopes, not products:use, so a product route refuses them
                .expectStatus().isForbidden();

        // API keys reach only the routes listed in gateway.api-key-routes (W4); ping is not one of them
        client.get().uri("/api/platform/v1/ping")
                .header(HttpHeaders.AUTHORIZATION, bearer("svc|reports|PRO"))
                .exchange()
                .expectStatus().isForbidden();
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "POST|/api/home-pulse/v1/ingest/readings|Bearer hpd_0123456789abcdef",
            "POST|/api/waiting-on/v1/webhooks/inbound-email|",
            "POST|/api/consent/v1/oauth/token|Basic Y2xpZW50OnNlY3JldA==",
            "POST|/api/consent/v1/oauth/introspect|Basic Y2xpZW50OnNlY3JldA==",
            "GET|/api/consent/v1/gateway/data|Bearer consent-access-token",
            "POST|/api/consent/v1/gateway/requests|Bearer consent-client-token",
            "GET|/api/consent/.well-known/jwks.json|",
            "GET|/api/shared/v1/files/download?token=signed.link.token|",
            "POST|/api/digital-legacy/v1/legacy/trustee/accept|",
            "GET|/api/digital-legacy/v1/legacy/trustee/portal|Bearer trustee-token",
            "GET|/api/auth/.well-known/jwks.json|"})
    void passthroughPathsAreForwardedUntouchedWithoutAnExchange(String method, String path, String authorization) {
        String service = path.split("/")[2];
        var request = client.method(org.springframework.http.HttpMethod.valueOf(method)).uri(path)
                .header("X-Webhook-Secret", "s3cret");
        if (authorization != null && !authorization.isBlank()) {
            request = request.header(HttpHeaders.AUTHORIZATION, authorization);
        }
        request.exchange().expectStatus().isOk().expectHeader().exists("X-Request-Id");

        Received downstream = backends.service(service).last();
        assertThat(downstream.header("authorization")).isEqualTo(authorization == null || authorization.isBlank() ? null : authorization);
        assertThat(downstream.header("x-webhook-secret")).isEqualTo("s3cret");
        assertThat(backends.exchangeCalls()).isZero();
    }

    @Test
    void theExchangeEndpointItselfIsPassthroughSoItReceivesTheFirebaseTokenNotAPlatformToken() {
        client.post().uri("/api/auth/v1/token/exchange")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER))
                .exchange().expectStatus().isOk();

        // exactly one call: the caller's own, with the caller's own credential
        assertThat(backends.exchangeCalls()).isEqualTo(1);
        assertThat(backends.auth().last().header("authorization")).isEqualTo(bearer(Backends.MEMBER));
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            // method does not match the passthrough rule
            "GET|/api/home-pulse/v1/ingest-not-really",
            "GET|/api/home-pulse/v1/devices",
            "DELETE|/api/shared/v1/files/download",
            "POST|/api/shared/v1/files/download",
            "GET|/api/shared/v1/files",
            "GET|/api/waiting-on/v1/items",
            "GET|/api/consent/v1/owner/requests",
            "GET|/api/consent/v1/oauthish/token",
            "GET|/api/digital-legacy/v1/legacy/owner/trustees"})
    void everythingElseStillNeedsACredential(String method, String path) {
        client.method(org.springframework.http.HttpMethod.valueOf(method)).uri(path)
                .exchange()
                .expectStatus().isUnauthorized();

        assertThat(backends.downstreamRequests()).isZero();
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "/api/home-pulse/v1/ingest/../devices",
            "/api/home-pulse/v1/ingest/%2e%2e/devices",
            "/api/home-pulse/v1/ingest/%2E%2E/devices",
            "/api/shared/v1/files/download/..%2f..%2fitems",
            "/api/shared/v1/files/download;x=1",
            "/api/waiting-on//v1/webhooks/inbound-email"})
    void pathTraversalAndAmbiguousPathsAreRejectedBeforeAnyPassthroughDecision(String path) {
        client.get().uri(java.net.URI.create("http://localhost:" + port + path))
                .exchange()
                .expectStatus().isBadRequest();

        assertThat(backends.downstreamRequests()).isZero();
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "/api/platform/internal/v1/plans",
            "/api/platform/internal/v1/quota/abc",
            "/api/waiting-on/actuator/env",
            "/api/auth/actuator/health"})
    void internalAndActuatorPathsAreNeverExposed(String path) {
        client.get().uri(path)
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER))
                .header("X-Internal-Key", Backends.INTERNAL_KEY)
                .exchange()
                .expectStatus().isNotFound();

        assertThat(backends.downstreamRequests()).isZero();
        assertThat(backends.platform().received()).isEmpty();
    }

    @Test
    void sameCredentialWithinTtlCallsTheExchangeOnceAndAfterExpiryAgain() {
        for (int i = 0; i < 2; i++) {
            client.get().uri("/api/waiting-on/v1/items")
                    .header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER))
                    .exchange().expectStatus().isOk();
        }
        assertThat(backends.exchangeCalls()).isEqualTo(1);

        clock.advance(Duration.ofSeconds(59));
        client.get().uri("/api/waiting-on/v1/items")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER))
                .exchange().expectStatus().isOk();
        assertThat(backends.exchangeCalls()).isEqualTo(1);

        clock.advance(Duration.ofSeconds(2));
        client.get().uri("/api/waiting-on/v1/items")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER))
                .exchange().expectStatus().isOk();
        assertThat(backends.exchangeCalls()).isEqualTo(2);
    }

    @Test
    void differentCredentialsAreCachedSeparately() {
        for (String credential : List.of(Backends.MEMBER, Backends.PRO, Backends.MEMBER, Backends.PRO)) {
            client.get().uri("/api/waiting-on/v1/items")
                    .header(HttpHeaders.AUTHORIZATION, bearer(credential))
                    .exchange().expectStatus().isOk();
        }
        assertThat(backends.exchangeCallsFor(Backends.MEMBER)).isEqualTo(1);
        assertThat(backends.exchangeCallsFor(Backends.PRO)).isEqualTo(1);
    }

    @Test
    void failedExchangesAreNotCached() {
        for (int i = 0; i < 2; i++) {
            client.get().uri("/api/waiting-on/v1/items")
                    .header(HttpHeaders.AUTHORIZATION, bearer(Backends.SUSPENDED))
                    .exchange().expectStatus().isForbidden();
        }
        assertThat(backends.exchangeCalls()).isEqualTo(2);
    }

    @Test
    void aValidRequestIdIsKeptAndAnInvalidOneIsReplaced() {
        client.get().uri("/api/shared/v1/files")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER))
                .header("X-Request-Id", "trace-abc.123")
                .exchange()
                .expectHeader().valueEquals("X-Request-Id", "trace-abc.123");
        assertThat(backends.service("shared").last().header("x-request-id")).isEqualTo("trace-abc.123");

        var response = client.get().uri("/api/shared/v1/files")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER))
                .header("X-Request-Id", "bad id\twith spaces")
                .exchange()
                .returnResult(String.class);
        String issued = response.getResponseHeaders().getFirst("X-Request-Id");
        assertThat(issued).matches("[A-Za-z0-9._-]{8,64}");
    }

    @Test
    void errorsCarryTheRequestIdInTheProblemBody() {
        var response = client.get().uri("/api/waiting-on/v1/items")
                .exchange()
                .expectStatus().isUnauthorized()
                .returnResult(String.class);
        String id = response.getResponseHeaders().getFirst("X-Request-Id");
        assertThat(id).isNotBlank();
        assertThat(response.getResponseBody().blockFirst()).contains(id);
    }

    @Test
    void anInternalKeyFromTheClientNeverReachesADownstreamService() {
        client.get().uri("/api/shared/v1/files")
                .header(HttpHeaders.AUTHORIZATION, bearer(Backends.MEMBER))
                .header("X-Internal-Key", "stolen")
                .exchange().expectStatus().isOk();

        assertThat(backends.service("shared").last().header("x-internal-key")).isNull();
    }

    @Test
    void credentialsNeverAppearInTheLogs(CapturedOutput output) {
        String secret = "u|logleak|FREE|products:use";
        client.get().uri("/api/waiting-on/v1/items").header(HttpHeaders.AUTHORIZATION, bearer(secret)).exchange();
        client.get().uri("/api/waiting-on/v1/items").header(HttpHeaders.AUTHORIZATION, bearer(Backends.SUSPENDED)).exchange();
        client.get().uri("/api/waiting-on/v1/items").header(HttpHeaders.AUTHORIZATION, "Bearer hpd_supersecretdevicetoken").exchange();

        assertThat(output.getAll())
                .doesNotContain(secret)
                .doesNotContain("logleak")
                .doesNotContain("hpd_supersecretdevicetoken");
        String minted = backends.service("waiting-on").last().header("authorization").substring("Bearer ".length());
        assertThat(output.getAll()).doesNotContain(minted);
    }
}
