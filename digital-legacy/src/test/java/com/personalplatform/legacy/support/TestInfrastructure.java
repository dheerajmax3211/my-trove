package com.personalplatform.legacy.support;

import com.personalplatform.legacy.notify.NotificationChannel;
import com.personalplatform.legacy.protocol.ChannelType;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.core.annotation.Order;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/** Real Postgres, a stub Firebase decoder (token = base64url(uid)), a fake clock and recording channels. */
@TestConfiguration(proxyBeanMethods = false)
public class TestInfrastructure {

    public static final Instant START = Instant.parse("2030-01-01T00:00:00Z");

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgresContainer() {
        return new PostgreSQLContainer(DockerImageName.parse("postgres:16"));
    }

    @Bean
    JwtDecoder stubJwtDecoder() {
        return token -> {
            String uid;
            try {
                uid = new String(java.util.Base64.getUrlDecoder().decode(token), StandardCharsets.UTF_8);
            } catch (IllegalArgumentException e) {
                throw new BadJwtException("malformed test token");
            }
            if (uid.isBlank()) {
                throw new BadJwtException("empty uid");
            }
            return Jwt.withTokenValue(token).header("alg", "none").subject(uid)
                    .claims(c -> c.putAll(Map.of("email_verified", true)))
                    .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(300)).build();
        };
    }

    @Bean
    @Primary
    MutableClock testClock() {
        return new MutableClock(START);
    }

    @Bean
    RecordingChannels recordingChannels() {
        return new RecordingChannels();
    }

    @Bean
    @Order(0)
    NotificationChannel recordingPush(RecordingChannels r) {
        return r.channel(ChannelType.PUSH);
    }

    @Bean
    @Order(0)
    NotificationChannel recordingEmail(RecordingChannels r) {
        return r.channel(ChannelType.EMAIL);
    }

    @Bean
    @Order(0)
    NotificationChannel recordingSms(RecordingChannels r) {
        return r.channel(ChannelType.SMS);
    }
}
