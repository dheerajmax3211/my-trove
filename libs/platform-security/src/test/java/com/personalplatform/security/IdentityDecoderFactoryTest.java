package com.personalplatform.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.security.testing.PlatformTestTokens;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

class IdentityDecoderFactoryTest {

    static PlatformTestTokens keys;
    static JwksServer jwks;

    @BeforeAll
    static void start() {
        keys = PlatformTestTokens.create("k");
        jwks = new JwksServer(keys);
    }

    @AfterAll
    static void stop() {
        jwks.close();
    }

    private static String platformToken() {
        return keys.platformToken("uid").build();
    }

    private static String firebaseToken() {
        return keys.platformToken("uid")
                .issuer("https://securetoken.google.com/proj")
                .audience("proj")
                .tokenUse(null)
                .build();
    }

    private MockEnvironment env() {
        return new MockEnvironment()
                .withProperty("app.firebase.project-id", "proj")
                .withProperty("app.firebase.jwk-set-uri", jwks.url())
                .withProperty("app.platform.jwk-set-uri", jwks.url());
    }

    @Test
    void modeDefaultsToFirebase() {
        JwtDecoder decoder = IdentityDecoderFactory.create(env());

        assertThat(decoder.decode(firebaseToken()).getSubject()).isEqualTo("uid");
        assertThatThrownBy(() -> decoder.decode(platformToken())).isInstanceOf(JwtException.class);
    }

    @Test
    void explicitFirebaseModeBehavesLikeTheDefault() {
        JwtDecoder decoder = IdentityDecoderFactory.create(env().withProperty("app.security.mode", "firebase"));

        assertThat(decoder.decode(firebaseToken()).getSubject()).isEqualTo("uid");
        assertThatThrownBy(() -> decoder.decode(platformToken())).isInstanceOf(JwtException.class);
    }

    @Test
    void platformModeReturnsThePlatformDecoder() {
        JwtDecoder decoder = IdentityDecoderFactory.create(env().withProperty("app.security.mode", "platform"));

        assertThat(decoder.decode(platformToken()).getSubject()).isEqualTo("uid");
        assertThatThrownBy(() -> decoder.decode(firebaseToken())).isInstanceOf(JwtException.class);
    }

    @Test
    void platformModeNeedsNoFirebaseProjectId() {
        MockEnvironment env = new MockEnvironment()
                .withProperty("app.security.mode", "PLATFORM")
                .withProperty("app.platform.jwk-set-uri", jwks.url());

        assertThat(IdentityDecoderFactory.create(env).decode(platformToken()).getSubject())
                .isEqualTo("uid");
    }

    @Test
    void firebaseModeStillRefusesToStartWithoutProjectId() {
        assertThatThrownBy(() -> IdentityDecoderFactory.create(new MockEnvironment()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("FIREBASE_PROJECT_ID");
    }

    @Test
    void platformPropertiesDefaultIssuerAndDeriveJwksUri() {
        PlatformProperties defaults = new PlatformProperties(null, null);

        assertThat(defaults.issuer()).isEqualTo("http://localhost:8081");
        assertThat(defaults.jwkSetUri()).isEqualTo("http://localhost:8081/.well-known/jwks.json");
        assertThat(new PlatformProperties("https://auth.example/", null).jwkSetUri())
                .isEqualTo("https://auth.example/.well-known/jwks.json");
    }

    @Test
    void explicitOverloadSelectsByMode() {
        var firebase = new FirebaseProperties("proj", jwks.url());
        var platform = new PlatformProperties("http://localhost:8081", jwks.url());

        assertThat(IdentityDecoderFactory.create(SecurityMode.PLATFORM, firebase, platform)
                        .decode(platformToken())
                        .getSubject())
                .isEqualTo("uid");
        assertThat(IdentityDecoderFactory.create(SecurityMode.FIREBASE, firebase, platform)
                        .decode(firebaseToken())
                        .getSubject())
                .isEqualTo("uid");
    }
}
