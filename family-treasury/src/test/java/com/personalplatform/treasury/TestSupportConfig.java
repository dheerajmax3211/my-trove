package com.personalplatform.treasury;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

/** Stub JWT decoder (token = base64url(uid), or base64url(uid|Display Name) to add a name claim) and a movable clock. */
@TestConfiguration(proxyBeanMethods = false)
class TestSupportConfig {

    static final Instant START = Instant.parse("2026-03-02T10:00:00Z"); // a Monday

    static class MutableClock extends Clock {
        private final AtomicReference<Instant> now = new AtomicReference<>(START);

        void set(Instant instant) {
            now.set(instant);
        }

        void advance(java.time.Duration d) {
            now.updateAndGet(i -> i.plus(d));
        }

        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now.get(); }
    }

    /** The shared notifications table is not part of this database: writes are recorded instead. */
    @Bean
    @Primary
    RecordingNotificationOutbox recordingNotificationOutbox() {
        return new RecordingNotificationOutbox();
    }

    @Bean
    @Primary
    MutableClock testClock() {
        return new MutableClock();
    }

    @Bean
    JwtDecoder stubJwtDecoder() {
        return token -> {
            String uid;
            try {
                uid = new String(java.util.Base64.getUrlDecoder().decode(token), java.nio.charset.StandardCharsets.UTF_8);
            } catch (IllegalArgumentException e) {
                throw new BadJwtException("malformed test token");
            }
            int bar = uid.indexOf('|');
            Jwt.Builder jwt = Jwt.withTokenValue(token).header("alg", "none").subject(bar < 0 ? uid : uid.substring(0, bar))
                    .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(300));
            if (bar >= 0) {
                jwt.claim("name", uid.substring(bar + 1));
            }
            return jwt.build();
        };
    }
}
