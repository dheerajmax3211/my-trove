package com.personalplatform.auth;

import java.time.Instant;
import java.util.Map;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

/** Test-only decoder: token "uid|email|emailVerified" becomes a Jwt, anything else is rejected. */
@TestConfiguration(proxyBeanMethods = false)
public class StubJwtConfig {

    @Bean
    JwtDecoder stubJwtDecoder() {
        return token -> {
            String[] parts;
            try {
                parts = new String(java.util.Base64.getUrlDecoder().decode(token),
                        java.nio.charset.StandardCharsets.UTF_8).split("\\|");
            } catch (IllegalArgumentException e) {
                throw new BadJwtException("malformed test token");
            }
            if (parts.length != 3) {
                throw new BadJwtException("malformed test token");
            }
            return Jwt.withTokenValue(token)
                    .header("alg", "none")
                    .subject(parts[0])
                    .claims(c -> c.putAll(Map.of("email", parts[1], "email_verified", Boolean.parseBoolean(parts[2]))))
                    .issuedAt(Instant.now())
                    .expiresAt(Instant.now().plusSeconds(300))
                    .build();
        };
    }
}
