package com.personalplatform.askyourlife.support;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Map;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

/** Stub JwtDecoder (token = base64url("uid")) and a settable clock. */
@TestConfiguration(proxyBeanMethods = false)
public class TestBeans {

    public static final MutableClock CLOCK = new MutableClock(Instant.parse("2026-06-01T12:00:00Z"));

    public static String bearer(String uid) {
        return "Bearer " + Base64.getUrlEncoder().withoutPadding().encodeToString(uid.getBytes(StandardCharsets.UTF_8));
    }

    @Bean
    JwtDecoder stubJwtDecoder() {
        return token -> {
            String uid;
            try {
                uid = new String(Base64.getUrlDecoder().decode(token), StandardCharsets.UTF_8);
            } catch (IllegalArgumentException e) {
                throw new BadJwtException("malformed test token");
            }
            return Jwt.withTokenValue(token).header("alg", "none").subject(uid).claims(c -> c.putAll(Map.of()))
                    .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(300)).build();
        };
    }

    public static final ScriptedEmbedder EMBEDDER = new ScriptedEmbedder();

    @Bean
    @Primary
    com.personalplatform.askyourlife.embedding.Embedder testEmbedder() {
        return EMBEDDER;
    }

    @Bean
    @Primary
    Clock testClock() {
        return CLOCK;
    }

    public static final class MutableClock extends Clock {
        private volatile Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        public void set(Instant i) {
            now = i;
        }

        public void advance(java.time.Duration d) {
            now = now.plus(d);
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
