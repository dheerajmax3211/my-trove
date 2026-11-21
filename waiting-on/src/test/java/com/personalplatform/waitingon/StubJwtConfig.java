package com.personalplatform.waitingon;

import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

/** Test-only decoder: a base64url token whose payload is the uid becomes a Jwt, anything else is rejected. */
@TestConfiguration(proxyBeanMethods = false)
class StubJwtConfig {

    static String bearer(String uid) {
        return "Bearer " + Base64.getUrlEncoder().withoutPadding()
                .encodeToString(("uid:" + uid).getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    @Bean
    JwtDecoder stubJwtDecoder() {
        return token -> {
            String raw;
            try {
                raw = new String(Base64.getUrlDecoder().decode(token), java.nio.charset.StandardCharsets.UTF_8);
            } catch (IllegalArgumentException e) {
                throw new BadJwtException("malformed test token");
            }
            if (!raw.startsWith("uid:")) {
                throw new BadJwtException("malformed test token");
            }
            return Jwt.withTokenValue(token).header("alg", "none").subject(raw.substring(4))
                    .claims(c -> c.putAll(Map.of("email", "x@example.com")))
                    .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(300)).build();
        };
    }
}
