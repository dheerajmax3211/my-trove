package com.personalplatform.gateway.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.personalplatform.gateway.support.Backends;
import com.personalplatform.gateway.support.GatewayTestBase;
import com.personalplatform.gateway.support.StubServer.Reply;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient.ResponseSpec;

class RateLimitTest extends GatewayTestBase {

    private static final String QUOTA_TYPE = "https://my-trove.dev/problems/quota-exceeded";
    private static final String RATE_TYPE = "https://my-trove.dev/problems/rate-limited";

    /** API keys as auth's exchange turns them into service tokens; the route below is open to keys with this permission. */
    private static final String FREE_KEY = "svc|app-free|FREE|usage:read:self";
    private static final String PRO_KEY = "svc|app-pro|PRO|usage:read:self";

    /** A person using the workspace (user token) on a product route. */
    private ResponseSpec call(String credential) {
        return client.get().uri("/api/waiting-on/v1/items")
                .header(HttpHeaders.AUTHORIZATION, bearer(credential))
                .exchange();
    }

    /** A program using an API key, on the route API keys may call. */
    private ResponseSpec api(String credential) {
        return client.get().uri("/api/platform/v1/usage/me")
                .header(HttpHeaders.AUTHORIZATION, bearer(credential))
                .exchange();
    }

    private int status(ResponseSpec spec) {
        return spec.expectBody().returnResult().getStatus().value();
    }

    @Test
    void aFreeApiKeyIsLimitedAfter120RequestsAMinuteWhileAProKeyIsNot() {
        for (int i = 1; i <= 120; i++) {
            ResponseSpec r = api(FREE_KEY);
            if (i == 1) {
                r.expectHeader().valueEquals("X-RateLimit-Limit", "120").expectHeader().valueEquals("X-RateLimit-Remaining", "119");
            } else {
                assertThat(status(r)).as("request %d", i).isEqualTo(200);
            }
        }

        api(FREE_KEY)
                .expectStatus().isEqualTo(429)
                .expectHeader().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON)
                .expectHeader().exists(HttpHeaders.RETRY_AFTER)
                .expectHeader().valueEquals("X-RateLimit-Limit", "120")
                .expectHeader().valueEquals("X-RateLimit-Remaining", "0")
                .expectHeader().value(HttpHeaders.RETRY_AFTER, v -> assertThat(Long.parseLong(v)).isBetween(1L, 60L))
                .expectBody()
                .jsonPath("$.type").isEqualTo(RATE_TYPE)
                .jsonPath("$.status").isEqualTo(429);

        // the limited request was never forwarded
        assertThat(backends.platform().received().stream().filter(r -> r.path().equals("/v1/usage/me"))).hasSize(120);

        for (int i = 1; i <= 130; i++) {
            assertThat(status(api(PRO_KEY))).as("pro request %d", i).isEqualTo(200);
        }
    }

    @Test
    void aPersonInTheWorkspaceGetsTheInteractiveCeilingNotTheFreePlanLimit() {
        // A FREE member browsing the workspace is not cut off at the plan's 120: one page fans out to several services.
        for (int i = 1; i <= 600; i++) {
            ResponseSpec r = call(Backends.MEMBER);
            if (i == 1) {
                r.expectHeader().valueEquals("X-RateLimit-Limit", "600");
            } else {
                assertThat(status(r)).as("request %d", i).isEqualTo(200);
            }
        }
        // ...but there is still a ceiling, so a runaway script with a stolen session cannot flood the platform.
        call(Backends.MEMBER).expectStatus().isEqualTo(429).expectHeader().exists(HttpHeaders.RETRY_AFTER)
                .expectBody().jsonPath("$.type").isEqualTo(RATE_TYPE);
    }

    @Test
    void aPersonInTheWorkspaceIsNeverStoppedByTheMonthlyQuota() {
        backends.platform().handler(r -> r.path().startsWith("/internal/")
                ? backends.internal(r, Backends.SEED_PLANS, "{\"plan\":\"FREE\",\"monthlyLimit\":10000,\"used\":10000}")
                : backends.platform().echo(r));

        for (int i = 0; i < 5; i++) {
            call(Backends.MEMBER).expectStatus().isOk();
        }
        // the quota is not even looked up for an interactive session
        assertThat(backends.platform().received().stream().filter(r -> r.path().startsWith("/internal/v1/quota/"))).isEmpty();
    }

    @Test
    void anotherPrincipalIsUnaffectedByAnExhaustedOne() {
        for (int i = 0; i < 121; i++) {
            status(api(FREE_KEY));
        }
        api(FREE_KEY).expectStatus().isEqualTo(429);

        api("svc|app-other|FREE|usage:read:self").expectStatus().isOk()
                .expectHeader().valueEquals("X-RateLimit-Remaining", "119");
    }

    @Test
    void aSpoofedForwardedForHeaderDoesNotResetAnAnonymousLimit() {
        for (int i = 0; i < 120; i++) {
            int s = status(client.post().uri("/api/home-pulse/v1/ingest/readings")
                    .header("X-Forwarded-For", "203.0.113." + (i % 250))
                    .header("Forwarded", "for=198.51.100." + (i % 250))
                    .header(HttpHeaders.AUTHORIZATION, "Bearer hpd_device")
                    .exchange());
            assertThat(s).as("request %d", i).isEqualTo(200);
        }

        client.post().uri("/api/home-pulse/v1/ingest/readings")
                .header("X-Forwarded-For", "192.0.2.77")
                .exchange()
                .expectStatus().isEqualTo(429)
                .expectHeader().exists(HttpHeaders.RETRY_AFTER);
    }

    @Test
    void failedAuthenticationAttemptsCountAgainstTheClientAddress() {
        for (int i = 0; i < 120; i++) {
            assertThat(status(call(Backends.UNAUTHORIZED))).as("attempt %d", i).isEqualTo(401);
        }
        // the 121st bad attempt is answered 429 (Retry-After) instead of 401, so a client hammering the gateway
        // with bad credentials learns to back off; the 401/403 problem itself is not what it sees any more
        call(Backends.UNAUTHORIZED).expectStatus().isEqualTo(429).expectHeader().exists(HttpHeaders.RETRY_AFTER);
        // a well-formed credential from the same address is still authenticated: the address bucket only counts failures
        call(Backends.PRO).expectStatus().isOk();
    }

    @Test
    void planLimitsComeFromPlatformServiceWhenItIsReachable() {
        String plans = "[{\"plan\":\"FREE\",\"requestsPerMinute\":3,\"requestsPerMonth\":10000}]";
        backends.platform().handler(r -> r.path().startsWith("/internal/")
                ? backends.internal(r, plans, "{\"plan\":\"FREE\",\"monthlyLimit\":10000,\"used\":0}")
                : backends.platform().echo(r));
        planLimits().reloadNow();

        for (int i = 0; i < 3; i++) {
            api(FREE_KEY).expectStatus().isOk();
        }
        api(FREE_KEY).expectStatus().isEqualTo(429).expectHeader().valueEquals("X-RateLimit-Limit", "3");
        // PRO keeps its seed value because the response did not mention it
        api(PRO_KEY).expectStatus().isOk().expectHeader().valueEquals("X-RateLimit-Limit", "600");
        assertThat(backends.platform().received().get(0).header("x-internal-key")).isEqualTo(Backends.INTERNAL_KEY);
    }

    @Test
    void seedPlanValuesApplyWhenPlatformServiceIsDown() {
        backends.platform().handler(r -> Reply.problem(503, "down"));
        planLimits().reloadNow();

        // the keys' route is served by the (down) platform-service itself, so only the limit header matters here
        api(FREE_KEY).expectHeader().valueEquals("X-RateLimit-Limit", "120");
        api(PRO_KEY).expectHeader().valueEquals("X-RateLimit-Limit", "600");
        api("svc|app-dev|DEVELOPER|usage:read:self").expectHeader().valueEquals("X-RateLimit-Limit", "1200");
        // a DEVELOPER-plan person in the workspace gets their plan's higher limit, not the interactive ceiling
        call("u|erin|DEVELOPER|products:use").expectStatus().isOk()
                .expectHeader().valueEquals("X-RateLimit-Limit", "1200");
    }

    @Test
    void monthlyQuotaExceededIsADistinct429AndNothingIsForwarded() {
        backends.platform().handler(r -> r.path().startsWith("/internal/")
                ? backends.internal(r, Backends.SEED_PLANS, "{\"plan\":\"FREE\",\"monthlyLimit\":10000,\"used\":10000}")
                : backends.platform().echo(r));

        // the first request admits and warms the quota cache in the background; it never waits for platform-service
        api(FREE_KEY).expectStatus().isOk();
        await().atMost(Duration.ofSeconds(5)).untilAsserted(() ->
                assertThat(backends.platform().received().stream().filter(r -> r.path().startsWith("/internal/v1/quota/")))
                        .hasSize(1));
        backends.platform().received().stream().filter(r -> r.path().startsWith("/internal/v1/quota/"))
                .forEach(r -> assertThat(r.path()).isIn("/internal/v1/quota/app:app-free", "/internal/v1/quota/app%3Aapp-free"));

        await().atMost(Duration.ofSeconds(5)).untilAsserted(() ->
                api(FREE_KEY)
                        .expectStatus().isEqualTo(429)
                        .expectHeader().exists(HttpHeaders.RETRY_AFTER)
                        .expectHeader().valueEquals("X-RateLimit-Remaining", "0")
                        .expectBody().jsonPath("$.type").isEqualTo(QUOTA_TYPE));

        // another key has its own quota
        api("svc|app-frank|FREE|usage:read:self").expectStatus().isOk();
    }

    @Test
    void aSlowOrDeadPlatformServiceNeverDelaysOrFailsRequests() {
        AtomicInteger hits = new AtomicInteger();
        backends.platform().handler(r -> {
            hits.incrementAndGet();
            try {
                Thread.sleep(5_000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return Reply.problem(500, "slow and broken");
        });

        long start = System.nanoTime();
        for (int i = 0; i < 5; i++) {
            call(Backends.MEMBER).expectStatus().isOk();
        }
        long elapsedMs = Duration.ofNanos(System.nanoTime() - start).toMillis();

        assertThat(elapsedMs).as("five requests while platform-service hangs").isLessThan(2_000);
        assertThat(backends.service("waiting-on").received()).hasSize(5);
    }

    @Test
    void passthroughRequestsAreNotSubjectToTheMonthlyQuota() {
        backends.platform().handler(r -> r.path().startsWith("/internal/")
                ? backends.internal(r, Backends.SEED_PLANS, "{\"plan\":\"FREE\",\"monthlyLimit\":1,\"used\":1}")
                : backends.platform().echo(r));

        for (int i = 0; i < 3; i++) {
            client.post().uri("/api/home-pulse/v1/ingest/readings").exchange().expectStatus().isOk();
        }
        assertThat(backends.platform().received().stream().filter(r -> r.path().startsWith("/internal/v1/quota/"))).isEmpty();
    }
}
