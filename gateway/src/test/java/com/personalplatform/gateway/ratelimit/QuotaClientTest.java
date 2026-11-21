package com.personalplatform.gateway.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.gateway.support.GatewayTestBase.MutableClock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;

class QuotaClientTest {

    private static final Duration TTL = Duration.ofSeconds(30);
    private static final Duration BACKOFF = Duration.ofSeconds(15);
    private static final Duration MAX_STALE = Duration.ofMinutes(10);

    private final MutableClock clock = new MutableClock();
    private final AtomicInteger fetches = new AtomicInteger();
    private final AtomicReference<Function<String, Mono<QuotaClient.Quota>>> backend = new AtomicReference<>();

    private QuotaClient client() {
        return new QuotaClient(clock, TTL, BACKOFF, MAX_STALE, 100, pid -> {
            fetches.incrementAndGet();
            return backend.get().apply(pid);
        });
    }

    @Test
    void requestsCountedLocallyBetweenRefreshesSoTheQuotaDoesNotOvershoot() {
        backend.set(pid -> Mono.just(new QuotaClient.Quota(10_000, 9_998)));
        QuotaClient quota = client();

        assertThat(quota.admit("alice").exceeded()).isFalse();
        assertThat(quota.admit("alice").exceeded()).isFalse();
        QuotaClient.Verdict third = quota.admit("alice");
        assertThat(third.exceeded()).isTrue();
        assertThat(third.limit()).isEqualTo(10_000);
        assertThat(fetches).hasValue(1);
    }

    @Test
    void theCachedFigureIsRefreshedAfterTheTtl() {
        AtomicInteger used = new AtomicInteger(10_000);
        backend.set(pid -> Mono.just(new QuotaClient.Quota(10_000, used.get())));
        QuotaClient quota = client();
        assertThat(quota.admit("alice").exceeded()).isTrue();

        used.set(5);
        clock.advance(TTL.minusSeconds(1));
        assertThat(quota.admit("alice").exceeded()).isTrue();
        assertThat(fetches).hasValue(1);

        clock.advance(Duration.ofSeconds(2));
        quota.admit("alice"); // triggers the refresh, still answered from the old figure
        assertThat(quota.admit("alice").exceeded()).isFalse();
        assertThat(fetches).hasValue(2);
    }

    @Test
    void platformServiceFailuresFailOpenAndBackOff() {
        backend.set(pid -> Mono.error(new IllegalStateException("down")));
        QuotaClient quota = client();

        for (int i = 0; i < 5; i++) {
            assertThat(quota.admit("alice").exceeded()).isFalse();
        }
        assertThat(fetches).as("no retry storm inside the back-off window").hasValue(1);

        clock.advance(BACKOFF.plusSeconds(1));
        assertThat(quota.admit("alice").exceeded()).isFalse();
        assertThat(fetches).hasValue(2);
    }

    @Test
    void aFigureOlderThanMaxStaleIsIgnored() {
        AtomicReference<Boolean> up = new AtomicReference<>(true);
        backend.set(pid -> up.get() ? Mono.just(new QuotaClient.Quota(10, 10)) : Mono.error(new IllegalStateException("down")));
        QuotaClient quota = client();
        assertThat(quota.admit("alice").exceeded()).isTrue();

        up.set(false);
        clock.advance(MAX_STALE.plusSeconds(1));
        quota.admit("alice"); // refresh attempt fails
        assertThat(quota.admit("alice").exceeded()).isFalse();
    }

    @Test
    void aNeverReachedPlatformServiceAdmitsTheFirstRequestWithoutWaiting() {
        backend.set(pid -> Mono.<QuotaClient.Quota>never());
        QuotaClient quota = client();

        Instant start = Instant.now();
        assertThat(quota.admit("alice").exceeded()).isFalse();
        assertThat(Duration.between(start, Instant.now())).isLessThan(Duration.ofMillis(200));
    }

    @Test
    void aZeroOrMissingMonthlyLimitMeansUnlimited() {
        backend.set(pid -> Mono.just(new QuotaClient.Quota(0, 99)));
        QuotaClient quota = client();
        assertThat(quota.admit("alice").exceeded()).isFalse();
    }

    @Test
    void retryAfterPointsAtTheStartOfTheNextUtcMonth() {
        assertThat(QuotaClient.secondsUntilNextMonth(Instant.parse("2026-11-30T23:59:00Z"))).isEqualTo(60);
        assertThat(QuotaClient.secondsUntilNextMonth(Instant.parse("2026-12-31T00:00:00Z"))).isEqualTo(24 * 3600);
    }
}
