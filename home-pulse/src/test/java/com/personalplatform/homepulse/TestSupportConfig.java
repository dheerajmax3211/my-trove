package com.personalplatform.homepulse;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Real TimescaleDB, a fake Firebase decoder (token = base64url of the uid) and a clock the tests control.
 * All integration tests share this configuration, hence one Spring context and one container.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestSupportConfig {

    /** Far in the future so test data is never touched by Timescale's wall-clock based background policies. */
    public static final Instant T0 = Instant.parse("2031-01-15T12:00:00Z");

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgresContainer() {
        return new PostgreSQLContainer(TimescaleImage.name());
    }

    @Bean
    @Primary
    MutableClock testClock() {
        return new MutableClock(T0);
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
            if (uid.isBlank() || !uid.startsWith("uid-")) {
                throw new BadJwtException("not a test token");
            }
            return Jwt.withTokenValue(token)
                    .header("alg", "none")
                    .subject(uid)
                    .claims(c -> c.putAll(Map.of("email", uid + "@example.com")))
                    .issuedAt(Instant.now())
                    .expiresAt(Instant.now().plusSeconds(300))
                    .build();
        };
    }
}
