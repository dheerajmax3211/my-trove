package com.personalplatform.auth.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.security.PlatformProperties;
import com.personalplatform.security.testing.PlatformTestTokens;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

class DualTokenDecoderTest {

    private static final String ISSUER = PlatformProperties.DEFAULT_ISSUER;

    private final PlatformTestTokens platformKeys = PlatformTestTokens.create();
    private final JwtDecoder firebase = token -> {
        if (!token.equals("firebase-token")) {
            throw new BadJwtException("not a firebase token");
        }
        return Jwt.withTokenValue(token).header("alg", "none").subject("fb-user")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
    };
    private final DualTokenDecoder decoder = new DualTokenDecoder(firebase, platformKeys.decoder(ISSUER), ISSUER);

    @Test
    void platformTokensAreVerifiedByThePlatformDecoder() {
        String token = platformKeys.platformToken("uid-1").permissions("products:use").build();
        Jwt jwt = decoder.decode(token);
        assertThat(jwt.getSubject()).isEqualTo("uid-1");
    }

    @Test
    void everythingElseGoesToTheFirebaseDecoder() {
        assertThat(decoder.decode("firebase-token").getSubject()).isEqualTo("fb-user");
        assertThatThrownBy(() -> decoder.decode("garbage")).isInstanceOf(BadJwtException.class);
    }

    @Test
    void aForgedPlatformIssuerStillHasToPassPlatformVerification() {
        String forged = platformKeys.platformToken("uid-1").buildUnsigned();
        assertThatThrownBy(() -> decoder.decode(forged)).isInstanceOf(BadJwtException.class);
        String otherKey = PlatformTestTokens.create().platformToken("uid-1").build();
        assertThatThrownBy(() -> decoder.decode(otherKey)).isInstanceOf(BadJwtException.class);
    }
}
