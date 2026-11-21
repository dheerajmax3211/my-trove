package com.personalplatform.shared;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

/** Test-only decoder: the token is just base64url(uid); anything that is not valid base64url is rejected. */
@TestConfiguration(proxyBeanMethods = false)
class StubJwtConfig {

    @Bean
    JwtDecoder stubJwtDecoder() {
        return token -> {
            String uid;
            try {
                uid = new String(Base64.getUrlDecoder().decode(token), StandardCharsets.UTF_8);
            } catch (IllegalArgumentException e) {
                throw new BadJwtException("malformed test token");
            }
            if (uid.isBlank()) {
                throw new BadJwtException("malformed test token");
            }
            return Jwt.withTokenValue(token).header("alg", "none").subject(uid)
                    .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(300)).build();
        };
    }
}
