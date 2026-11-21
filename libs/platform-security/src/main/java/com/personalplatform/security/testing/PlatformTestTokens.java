package com.personalplatform.security.testing;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.PlainJWT;
import com.nimbusds.jwt.SignedJWT;
import com.personalplatform.security.PlatformJwtDecoderFactory;
import com.personalplatform.security.PlatformProperties;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

/**
 * Test support for any module that verifies platform tokens: mints signed platform and service tokens with a
 * throwaway RSA key and exposes a {@link JwtDecoder} that trusts exactly that key and applies the production claim
 * rules ({@link PlatformJwtDecoderFactory#validator(String)}).
 *
 * <pre>{@code
 * static final PlatformTestTokens TOKENS = PlatformTestTokens.create();
 *
 * @Bean JwtDecoder jwtDecoder() { return TOKENS.decoder(); }     // in a @TestConfiguration
 *
 * String bearer = "Bearer " + TOKENS.platformToken("firebase-uid").roles("ADMIN").permissions("usage:read:all").build();
 * }</pre>
 *
 * The key is generated per instance and never leaves memory, so tokens minted here are accepted by no real service.
 * Forged-token cases: {@code Builder.buildUnsigned()} ({@code alg: none}), a second instance (unknown key),
 * {@code audience(..)}, {@code issuer(..)}, {@code expiresAt(..)}, {@code tokenUse(..)}.
 */
public final class PlatformTestTokens {

    public static final String DEFAULT_ISSUER = PlatformProperties.DEFAULT_ISSUER;

    private final RSAKey key;

    private PlatformTestTokens(RSAKey key) {
        this.key = key;
    }

    public static PlatformTestTokens create() {
        return create(UUID.randomUUID().toString());
    }

    /** A fresh key with the given {@code kid}; two instances sharing a kid still have different keys. */
    public static PlatformTestTokens create(String kid) {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            KeyPair pair = generator.generateKeyPair();
            RSAKey rsa = new RSAKey.Builder((RSAPublicKey) pair.getPublic())
                    .privateKey((RSAPrivateKey) pair.getPrivate())
                    .keyID(kid)
                    .keyUse(KeyUse.SIGNATURE)
                    .algorithm(JWSAlgorithm.RS256)
                    .build();
            return new PlatformTestTokens(rsa);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public String kid() {
        return key.getKeyID();
    }

    public RSAPublicKey publicKey() {
        try {
            return key.toRSAPublicKey();
        } catch (JOSEException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Public JWK set (never contains private parameters), e.g. to serve from a stub JWKS endpoint. */
    public String jwkSetJson() {
        return new JWKSet(key.toPublicJWK()).toString();
    }

    /** Decoder trusting only this key, with issuer {@link #DEFAULT_ISSUER}. */
    public JwtDecoder decoder() {
        return decoder(DEFAULT_ISSUER);
    }

    public JwtDecoder decoder(String issuer) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withPublicKey(publicKey()).build();
        decoder.setJwtValidator(PlatformJwtDecoderFactory.validator(issuer));
        return decoder;
    }

    /** A user token ({@code token_use=platform}) for the given Firebase uid, valid for 10 minutes. */
    public Builder platformToken(String firebaseUid) {
        return new Builder(this, firebaseUid, PlatformProperties.TOKEN_USE_PLATFORM);
    }

    /** A service-principal token ({@code token_use=service}, {@code sub=app:<appId>}), valid for 10 minutes. */
    public Builder serviceToken(String appId) {
        return new Builder(this, "app:" + appId, PlatformProperties.TOKEN_USE_SERVICE);
    }

    public static final class Builder {

        private final PlatformTestTokens owner;
        private final Map<String, Object> claims = new LinkedHashMap<>();
        private String kid;
        private Instant issuedAt = Instant.now();
        private Instant expiresAt;

        private Builder(PlatformTestTokens owner, String subject, String tokenUse) {
            this.owner = owner;
            this.kid = owner.kid();
            claims.put("sub", subject);
            claims.put("iss", DEFAULT_ISSUER);
            claims.put("aud", List.of(PlatformProperties.AUDIENCE));
            claims.put("token_use", tokenUse);
            claims.put("jti", UUID.randomUUID().toString());
            claims.put("pv", 1);
        }

        public Builder uid(String uid) {
            return claim("uid", uid);
        }

        public Builder uid(UUID uid) {
            return claim("uid", uid.toString());
        }

        public Builder email(String email) {
            return claim("email", email);
        }

        public Builder name(String name) {
            return claim("name", name);
        }

        public Builder roles(String... roles) {
            return claim("roles", List.of(roles));
        }

        public Builder permissions(String... permissions) {
            return claim("permissions", List.of(permissions));
        }

        public Builder scopes(String... scopes) {
            return claim("scopes", List.of(scopes));
        }

        public Builder plan(String plan) {
            return claim("plan", plan);
        }

        public Builder workspaces(String... workspaces) {
            return claim("workspaces", List.of(workspaces));
        }

        public Builder permissionsVersion(int pv) {
            return claim("pv", pv);
        }

        /** Impersonator's uid (the {@code act} claim). */
        public Builder actor(String actorUid) {
            return claim("act", Map.of("sub", actorUid));
        }

        public Builder issuer(String issuer) {
            return claim("iss", issuer);
        }

        public Builder audience(String... audience) {
            return claim("aud", List.of(audience));
        }

        public Builder tokenUse(String tokenUse) {
            return claim("token_use", tokenUse);
        }

        /** Header {@code kid} (defaults to the key's own). */
        public Builder kid(String kid) {
            this.kid = kid;
            return this;
        }

        public Builder issuedAt(Instant issuedAt) {
            this.issuedAt = issuedAt;
            return this;
        }

        public Builder expiresAt(Instant expiresAt) {
            this.expiresAt = expiresAt;
            return this;
        }

        public Builder expiresIn(Duration ttl) {
            return expiresAt(Instant.now().plus(ttl));
        }

        /** Sets a claim; a {@code null} value removes it (use {@code claim("exp", null)} for no expiry). */
        public Builder claim(String name, Object value) {
            if (value == null) {
                claims.remove(name);
                if ("exp".equals(name)) {
                    expiresAt = Instant.MIN;
                }
            } else {
                claims.put(name, value);
            }
            return this;
        }

        private JWTClaimsSet claimsSet() {
            JWTClaimsSet.Builder builder = new JWTClaimsSet.Builder();
            claims.forEach(builder::claim);
            builder.issueTime(Date.from(issuedAt));
            if (!Instant.MIN.equals(expiresAt)) {
                builder.expirationTime(Date.from(expiresAt != null ? expiresAt : Instant.now().plusSeconds(600)));
            }
            return builder.build();
        }

        /** RS256-signed token. */
        public String build() {
            try {
                SignedJWT jwt = new SignedJWT(
                        new JWSHeader.Builder(JWSAlgorithm.RS256)
                                .type(JOSEObjectType.JWT)
                                .keyID(kid)
                                .build(),
                        claimsSet());
                jwt.sign(new RSASSASigner(owner.key));
                return jwt.serialize();
            } catch (JOSEException e) {
                throw new IllegalStateException(e);
            }
        }

        /** An unsigned token with {@code alg: none}, for forgery tests. */
        public String buildUnsigned() {
            return new PlainJWT(claimsSet()).serialize();
        }
    }
}
