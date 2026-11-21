package com.personalplatform.consent.support;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/** Real Postgres, a stub Firebase decoder (token = base64url(uid)) and a controllable clock. */
@TestConfiguration(proxyBeanMethods = false)
public class TestSupportConfig {

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgresContainer() {
        return new PostgreSQLContainer(DockerImageName.parse("postgres:16"));
    }

    @Bean
    @Primary
    MutableClock testClock() {
        return new MutableClock(Instant.now().truncatedTo(ChronoUnit.SECONDS));
    }

    @Bean
    @Primary
    @Qualifier("firebase")
    JwtDecoder stubFirebaseJwtDecoder() {
        return token -> {
            String uid;
            try {
                uid = new String(Base64.getUrlDecoder().decode(token), StandardCharsets.UTF_8);
            } catch (IllegalArgumentException e) {
                throw new BadJwtException("malformed test token");
            }
            if (uid.isBlank() || !uid.startsWith("owner-")) {
                throw new BadJwtException("malformed test token");
            }
            return Jwt.withTokenValue(token)
                    .header("alg", "none")
                    .subject(uid)
                    .issuedAt(Instant.now())
                    .expiresAt(Instant.now().plusSeconds(300))
                    .build();
        };
    }
}
