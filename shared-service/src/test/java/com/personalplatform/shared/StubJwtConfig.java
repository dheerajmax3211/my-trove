package com.personalplatform.shared;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

/**
 * Test-only decoder: the token is base64url(uid), or base64url(uid|email) to also carry the email claim. Anything that
 * is not valid base64url is rejected.
 */
@TestConfiguration(proxyBeanMethods = false)
class StubJwtConfig {

    @Bean
    JwtDecoder stubJwtDecoder() {
        return token -> {
            String decoded;
            try {
                decoded = new String(Base64.getUrlDecoder().decode(token), StandardCharsets.UTF_8);
            } catch (IllegalArgumentException e) {
                throw new BadJwtException("malformed test token");
            }
            int bar = decoded.indexOf('|');
            String uid = bar < 0 ? decoded : decoded.substring(0, bar);
            String email = bar < 0 ? null : decoded.substring(bar + 1);
            if (uid.isBlank()) {
                throw new BadJwtException("malformed test token");
            }
            Jwt.Builder builder = Jwt.withTokenValue(token).header("alg", "none").subject(uid)
                    .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(300));
            if (email != null) {
                builder.claim("email", email);
            }
            return builder.build();
        };
    }
}
