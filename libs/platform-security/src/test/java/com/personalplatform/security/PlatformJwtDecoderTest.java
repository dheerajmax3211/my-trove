package com.personalplatform.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.personalplatform.security.testing.PlatformTestTokens;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

/** Forged-token matrix (Review Focus 5) against a decoder that fetches keys from a real JWKS URL. */
class PlatformJwtDecoderTest {

    static final String ISSUER = "http://localhost:8081";

    static PlatformTestTokens trusted;
    static JwksServer jwks;
    static JwtDecoder decoder;

    @BeforeAll
    static void start() {
        trusted = PlatformTestTokens.create("key-1");
        jwks = new JwksServer(trusted);
        decoder = PlatformJwtDecoderFactory.create(new PlatformProperties(ISSUER, jwks.url()));
    }

    @AfterAll
    static void stop() {
        jwks.close();
    }

    @Test
    void acceptsValidPlatformToken() {
        String token = trusted.platformToken("firebase-uid-1")
                .uid("0198f6c0-0000-7000-8000-000000000001")
                .email("a@example.com")
                .roles("MEMBER")
                .permissions("products:use")
                .plan("FREE")
                .build();

        Jwt jwt = decoder.decode(token);

        assertThat(jwt.getSubject()).isEqualTo("firebase-uid-1");
        assertThat(jwt.getClaimAsString("token_use")).isEqualTo("platform");
        assertThat(jwt.getAudience()).containsExactly("trove-platform");
        assertThat(jwt.getClaimAsStringList("permissions")).containsExactly("products:use");
    }

    @Test
    void acceptsServiceToken() {
        String token = trusted.serviceToken("app-42").scopes("data:read").build();

        assertThat(decoder.decode(token).getSubject()).isEqualTo("app:app-42");
    }

    @Test
    void rejectsAlgNone() {
        String token = trusted.platformToken("u").roles("OWNER").buildUnsigned();

        assertThat(token).endsWith(".");
        assertRejected(token);
    }

    @Test
    void rejectsTokenSignedByUnknownKeyEvenWithTheTrustedKid() {
        PlatformTestTokens attacker = PlatformTestTokens.create("key-1");

        assertRejected(attacker.platformToken("u").roles("OWNER").build());
    }

    @Test
    void rejectsTokenWithUnknownKid() {
        assertRejected(trusted.platformToken("u").kid("not-in-jwks").build());
    }

    @Test
    void rejectsWrongAudience() {
        assertRejected(trusted.platformToken("u").audience("some-other-service").build());
        assertRejected(trusted.platformToken("u").audience("consent-gateway").build());
    }

    @Test
    void rejectsMissingAudience() {
        assertRejected(trusted.platformToken("u").claim("aud", null).build());
    }

    @Test
    void rejectsWrongIssuer() {
        assertRejected(trusted.platformToken("u").issuer("http://evil.example").build());
        assertRejected(trusted.platformToken("u").issuer("https://securetoken.google.com/some-project").build());
    }

    @Test
    void rejectsExpiredToken() {
        assertRejected(trusted.platformToken("u")
                .issuedAt(Instant.now().minus(Duration.ofHours(2)))
                .expiresAt(Instant.now().minus(Duration.ofHours(1)))
                .build());
    }

    @Test
    void rejectsTokenWithoutExpiry() {
        assertRejected(trusted.platformToken("u").claim("exp", null).build());
    }

    @Test
    void rejectsWrongOrMissingTokenUse() {
        assertRejected(trusted.platformToken("u").tokenUse("access").build());
        assertRejected(trusted.platformToken("u").tokenUse(null).build());
    }

    @Test
    void rejectsMissingSubject() {
        assertRejected(trusted.platformToken("u").claim("sub", null).build());
    }

    @Test
    void rejectsHmacTokenSignedWithThePublicKeyAsSecret() throws Exception {
        SignedJWT jwt = new SignedJWT(
                new JWSHeader.Builder(JWSAlgorithm.HS256).type(JOSEObjectType.JWT).keyID("key-1").build(),
                new JWTClaimsSet.Builder()
                        .subject("u")
                        .issuer(ISSUER)
                        .audience("trove-platform")
                        .claim("token_use", "platform")
                        .expirationTime(Date.from(Instant.now().plusSeconds(300)))
                        .build());
        jwt.sign(new MACSigner(trusted.publicKey().getEncoded()));

        assertRejected(jwt.serialize());
    }

    @Test
    void rejectsGarbage() {
        assertRejected("not-a-jwt");
    }

    @Test
    void localDecoderFromTheTestHelperAppliesTheSameRules() {
        JwtDecoder local = trusted.decoder();

        assertThat(local.decode(trusted.platformToken("u").build()).getSubject()).isEqualTo("u");
        assertThatThrownBy(() -> local.decode(trusted.platformToken("u").audience("x").build()))
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> local.decode(trusted.platformToken("u").issuer("http://evil.example").build()))
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> local.decode(PlatformTestTokens.create().platformToken("u").build()))
                .isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> local.decode(trusted.platformToken("u").buildUnsigned()))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void jwkSetExposesOnlyPublicParameters() {
        String json = trusted.jwkSetJson();

        assertThat(json).contains("\"kid\":\"key-1\"").contains("\"n\"").contains("\"e\"");
        for (String privateParam : new String[] {"\"d\"", "\"p\"", "\"q\"", "\"dp\"", "\"dq\"", "\"qi\""}) {
            assertThat(json).doesNotContain(privateParam);
        }
    }

    private static void assertRejected(String token) {
        assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
    }
}
