package com.personalplatform.auth.token;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.personalplatform.auth.config.AppProperties;
import java.text.ParseException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Verifies a service token that this service issued for an API key ({@link PlatformTokenIssuer#issueService}):
 * RS256 signature by one of our own signing keys, our issuer, audience {@code trove-platform},
 * {@code token_use=service}, not expired, and the key, app and owner claims present and well formed.
 */
@Component
public class ServiceTokenVerifier {

    /** What a verified service token says about its key. */
    public record ServiceToken(UUID appId, UUID keyId, UUID ownerUid, List<String> permissions, Instant expiresAt) {}

    /** The token is not a valid service token of this issuer. */
    public static final class InvalidServiceTokenException extends RuntimeException {
        InvalidServiceTokenException(String message) {
            super(message);
        }
    }

    private final SigningKeyService keys;
    private final String issuer;
    private final Clock clock;

    public ServiceTokenVerifier(SigningKeyService keys, AppProperties props, Clock clock) {
        this.keys = keys;
        this.issuer = props.platform().issuer();
        this.clock = clock;
    }

    public ServiceToken verify(String token) {
        if (token == null || token.isBlank()) {
            throw new InvalidServiceTokenException("no service token");
        }
        SignedJWT jwt;
        JWTClaimsSet c;
        try {
            jwt = SignedJWT.parse(token);
            if (!JWSAlgorithm.RS256.equals(jwt.getHeader().getAlgorithm())) {
                throw new InvalidServiceTokenException("not RS256");
            }
            JWK key = jwt.getHeader().getKeyID() == null ? null
                    : keys.verificationJwkSet().getKeyByKeyId(jwt.getHeader().getKeyID());
            if (!(key instanceof RSAKey rsa) || !jwt.verify(new RSASSAVerifier(rsa))) {
                throw new InvalidServiceTokenException("signature does not verify");
            }
            c = jwt.getJWTClaimsSet();
        } catch (ParseException | JOSEException e) {
            throw new InvalidServiceTokenException("unreadable token");
        }
        try {
            if (!issuer.equals(c.getIssuer())) {
                throw new InvalidServiceTokenException("wrong issuer");
            }
            if (c.getAudience() == null || !c.getAudience().contains(PlatformTokenIssuer.AUDIENCE)) {
                throw new InvalidServiceTokenException("wrong audience");
            }
            if (!PlatformTokenIssuer.SERVICE_TOKEN_USE.equals(c.getStringClaim("token_use"))) {
                throw new InvalidServiceTokenException("not a service token");
            }
            if (c.getExpirationTime() == null || !c.getExpirationTime().toInstant().isAfter(clock.instant())) {
                throw new InvalidServiceTokenException("expired");
            }
            String subject = c.getSubject();
            if (subject == null || !subject.startsWith("app:")) {
                throw new InvalidServiceTokenException("subject is not an app");
            }
            UUID appId = UUID.fromString(subject.substring("app:".length()));
            UUID keyId = UUID.fromString(required(c.getStringClaim("key_id")));
            UUID owner = UUID.fromString(required(c.getStringClaim("owner_uid")));
            List<String> permissions = c.getStringListClaim("permissions");
            return new ServiceToken(appId, keyId, owner, permissions == null ? List.of() : List.copyOf(permissions),
                    c.getExpirationTime().toInstant());
        } catch (ParseException | IllegalArgumentException e) {
            throw new InvalidServiceTokenException("malformed claims");
        }
    }

    private static String required(String value) {
        if (value == null) {
            throw new IllegalArgumentException("missing claim");
        }
        return value;
    }
}
