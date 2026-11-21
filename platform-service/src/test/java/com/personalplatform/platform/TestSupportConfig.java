package com.personalplatform.platform;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;

/**
 * Stub JWT decoder (endpoint tests use the {@code jwt()} request post-processor, which bypasses decoding, so this only
 * has to exist and refuse everything) and a movable clock. The clock sits in 2031 like all test data, so the container's
 * wall-clock based Timescale jobs never touch it.
 */
@TestConfiguration(proxyBeanMethods = false)
class TestSupportConfig {

    static final Instant START = Instant.parse("2031-03-15T10:00:00Z");

    static class MutableClock extends Clock {
        private final AtomicReference<Instant> now = new AtomicReference<>(START);

        void set(Instant instant) {
            now.set(instant);
        }

        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now.get(); }
    }

    @Bean
    @Primary
    MutableClock testClock() {
        return new MutableClock();
    }

    @Bean
    JwtDecoder stubJwtDecoder() {
        return token -> {
            throw new BadJwtException("tests authenticate with the jwt() post-processor");
        };
    }
}
