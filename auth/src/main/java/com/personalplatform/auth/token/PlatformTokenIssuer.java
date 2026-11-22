package com.personalplatform.auth.token;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.personalplatform.auth.config.AppProperties;
import com.personalplatform.auth.user.AuthUser;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Builds and signs platform tokens (design 5.3): RS256, {@code aud=trove-platform}, {@code token_use=platform}, 10 min.
 * Claims: sub (Firebase uid), uid, email, name, roles[], permissions[], plan, workspaces[], pv, optional act.
 */
@Service
public class PlatformTokenIssuer {

    public static final String AUDIENCE = "trove-platform";
    public static final String TOKEN_USE = "platform";
    public static final String SERVICE_TOKEN_USE = "service";
    public static final Duration TTL = Duration.ofSeconds(600);

    private final SigningKeyService keys;
    private final AppProperties.Platform props;
    private final Clock clock;

    public PlatformTokenIssuer(SigningKeyService keys, AppProperties props, Clock clock) {
        this.keys = keys;
        this.props = props.platform();
        this.clock = clock;
    }

    /**
     * @param actorUid Firebase uid of an impersonating operator, emitted as the {@code act} claim (a plain string, as
     *                 in the design contract); empty for a normal sign-in
     * @throws IllegalArgumentException if the user is suspended: a suspended user never receives a token
     */
    public String issue(AuthUser user, Optional<String> actorUid) {
        if (user.suspended()) {
            throw new IllegalArgumentException("A suspended user cannot be issued a platform token");
        }
        Instant now = clock.instant();
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .issuer(props.issuer())
                .subject(user.firebaseUid())
                .audience(AUDIENCE)
                .issueTime(Date.from(now))
                .notBeforeTime(Date.from(now))
                .expirationTime(Date.from(now.plus(TTL)))
                .jwtID(UUID.randomUUID().toString())
                .claim("token_use", TOKEN_USE)
                .claim("uid", user.id().toString())
                .claim("roles", sorted(user.roles()))
                .claim("permissions", sorted(user.permissions()))
                .claim("plan", user.plan())
                .claim("workspaces", List.of())
                .claim("pv", user.permissionsVersion());
        if (user.email() != null) {
            claims.claim("email", user.email());
        }
        if (user.displayName() != null) {
            claims.claim("name", user.displayName());
        }
        actorUid.ifPresent(a -> claims.claim("act", a));

        SigningKeyService.ActiveKey key = keys.activeKey();
        SignedJWT jwt = new SignedJWT(
                new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.kid()).type(JOSEObjectType.JWT).build(),
                claims.build());
        try {
            jwt.sign(key.signer());
        } catch (JOSEException e) {
            throw new IllegalStateException("Could not sign the platform token", e);
        }
        return jwt.serialize();
    }

    /**
     * A service token for an API key (design 5.3): {@code sub = app:<appId>}, {@code token_use = service}, scopes and
     * permissions taken from the key alone (never from its owner), the owner's plan for rate limiting.
     */
    public String issueService(VerifiedApiKey key, String plan) {
        Instant now = clock.instant();
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(props.issuer())
                .subject("app:" + key.appId())
                .audience(AUDIENCE)
                .issueTime(Date.from(now))
                .notBeforeTime(Date.from(now))
                .expirationTime(Date.from(now.plus(TTL)))
                .jwtID(UUID.randomUUID().toString())
                .claim("token_use", SERVICE_TOKEN_USE)
                .claim("scopes", sorted(key.scopes()))
                .claim("permissions", sorted(key.permissions()))
                .claim("plan", plan)
                .claim("key_id", key.keyId().toString())
                .claim("owner_uid", key.ownerUid())
                .build();
        SigningKeyService.ActiveKey active = keys.activeKey();
        SignedJWT jwt = new SignedJWT(
                new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(active.kid()).type(JOSEObjectType.JWT).build(), claims);
        try {
            jwt.sign(active.signer());
        } catch (JOSEException e) {
            throw new IllegalStateException("Could not sign the service token", e);
        }
        return jwt.serialize();
    }

    private static List<String> sorted(java.util.Collection<String> values) {
        return values.stream().sorted().toList();
    }
}
