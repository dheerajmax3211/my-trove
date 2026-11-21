package com.personalplatform.gateway.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.gateway.support.GatewayTestBase.MutableClock;
import com.personalplatform.gateway.support.TestJwt;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

class ExchangeCacheTest {

    private final MutableClock clock = new MutableClock();

    private static ExchangeResult result(String uid) {
        String token = TestJwt.platformToken(uid, "FREE", List.of("products:use"));
        TokenClaims claims = TokenClaims.parse(token);
        return new ExchangeResult(token, claims, claims.toIdentity());
    }

    @Test
    void concurrentRequestsForOneCredentialShareASingleExchange() {
        ExchangeCache cache = new ExchangeCache(clock, Duration.ofSeconds(60), 100);
        AtomicInteger calls = new AtomicInteger();

        Flux.range(0, 20)
                .flatMap(i -> cache.get("cred", () -> Mono.fromSupplier(() -> {
                    calls.incrementAndGet();
                    return result("a");
                }).delayElement(Duration.ofMillis(50))))
                .blockLast();

        assertThat(calls).hasValue(1);
    }

    @Test
    void aFailureIsNotRememberedSoTheNextRequestTriesAgain() {
        ExchangeCache cache = new ExchangeCache(clock, Duration.ofSeconds(60), 100);
        AtomicInteger calls = new AtomicInteger();

        for (int i = 0; i < 2; i++) {
            assertThatThrownBy(() -> cache.get("cred", () -> {
                calls.incrementAndGet();
                return Mono.<ExchangeResult>error(new ExchangeFailure.Unavailable("down", false, null));
            }).block()).isInstanceOf(ExchangeFailure.Unavailable.class);
        }
        assertThat(calls).hasValue(2);
        assertThat(cache.size()).isZero();
    }

    @Test
    void theCacheIsBoundedAndKeepsOnlyHashesOfCredentials() {
        ExchangeCache cache = new ExchangeCache(clock, Duration.ofSeconds(60), 3);
        for (int i = 0; i < 10; i++) {
            cache.get("credential-" + i, () -> Mono.just(result("u"))).block();
        }
        assertThat(cache.size()).isEqualTo(3);
        assertThat(ExchangeCache.key("credential-1")).hasSize(64).doesNotContain("credential");
    }

    @Test
    void anEntryNeverOutlivesTheTokenItHolds() {
        ExchangeCache cache = new ExchangeCache(clock, Duration.ofHours(1), 10);
        AtomicInteger calls = new AtomicInteger();
        // the token minted by TestJwt lives 600 s; the cache TTL is an hour
        for (Duration advance : List.of(Duration.ZERO, Duration.ofMinutes(11))) {
            clock.advance(advance);
            cache.get("cred", () -> {
                calls.incrementAndGet();
                return Mono.just(result("a"));
            }).block();
        }
        assertThat(calls).hasValue(2);
    }
}
