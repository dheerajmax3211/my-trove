package com.personalplatform.consent.token;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.personalplatform.consent.client.ClientRecord;
import com.personalplatform.consent.config.ConsentProperties;
import com.personalplatform.consent.consent.GrantRepository;
import com.personalplatform.consent.consent.GrantRow;
import com.personalplatform.consent.keys.GatewayJwtDecoderFactory;
import com.personalplatform.consent.keys.SigningKeyService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Issues, introspects and revokes the gateway's RS256 JWTs. Every issued token is recorded by {@code jti}. */
@Service
public class TokenService {

    public static final String USE_CLIENT = "client";
    public static final String USE_ACCESS = "access";

    public record IssuedToken(String token, UUID jti, Instant expiresAt, String tokenUse, String scope, String kid) {
        public long expiresInSeconds(Instant now) {
            return Math.max(0, expiresAt.getEpochSecond() - now.getEpochSecond());
        }

        @Override
        public String toString() {
            return "IssuedToken[jti=" + jti + ", use=" + tokenUse + "]";
        }
    }

    private final SigningKeyService keys;
    private final TokenRepository tokens;
    private final GrantRepository grants;
    private final JwtDecoder decoder;
    private final ConsentProperties props;
    private final Clock clock;

    public TokenService(
            SigningKeyService keys,
            TokenRepository tokens,
            GrantRepository grants,
            @Qualifier("gateway") JwtDecoder decoder,
            ConsentProperties props,
            Clock clock) {
        this.keys = keys;
        this.tokens = tokens;
        this.grants = grants;
        this.decoder = decoder;
        this.props = props;
        this.clock = clock;
    }

    /** A token proving "this is client X" (used to create access requests and to exchange grants). */
    @Transactional
    public IssuedToken issueClientToken(ClientRecord client) {
        Instant now = clock.instant();
        Instant exp = now.plus(props.clientTokenTtl()).truncatedTo(ChronoUnit.SECONDS);
        return sign(client, null, USE_CLIENT, "gateway:requests", now, exp);
    }

    /** A token that can read data under one grant. It never outlives the grant. */
    @Transactional
    public IssuedToken issueAccessToken(ClientRecord client, GrantRow grant) {
        Instant now = clock.instant();
        Instant exp = now.plus(props.accessTokenTtl()).truncatedTo(ChronoUnit.SECONDS);
        Instant grantEnd = grant.expiresAt().truncatedTo(ChronoUnit.SECONDS);
        if (grantEnd.isBefore(exp)) {
            exp = grantEnd;
        }
        return sign(client, grant.id(), USE_ACCESS, String.join(" ", grant.scopes()), now, exp);
    }

    private IssuedToken sign(ClientRecord client, UUID grantId, String use, String scope, Instant now, Instant exp) {
        SigningKeyService.ActiveKey key = keys.activeKey();
        UUID jti = UUID.randomUUID();
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .issuer(props.issuer())
                .subject(client.clientId())
                .audience(props.audience())
                .issueTime(Date.from(now))
                .notBeforeTime(Date.from(now))
                .expirationTime(Date.from(exp))
                .jwtID(jti.toString())
                .claim("token_use", use)
                .claim("scope", scope);
        if (grantId != null) {
            claims.claim("grant_id", grantId.toString());
        }
        try {
            SignedJWT jwt = new SignedJWT(
                    new JWSHeader.Builder(JWSAlgorithm.RS256)
                            .keyID(key.kid())
                            .type(GatewayJwtDecoderFactory.TOKEN_TYPE)
                            .build(),
                    claims.build());
            jwt.sign(key.signer());
            tokens.insert(jti, client.pk(), grantId, use, key.kid(), now.atOffset(ZoneOffset.UTC), exp.atOffset(ZoneOffset.UTC));
            return new IssuedToken(jwt.serialize(), jti, exp, use, scope, key.kid());
        } catch (JOSEException e) {
            throw new IllegalStateException("Token signing failed", e);
        }
    }

    /**
     * RFC 7662-style introspection. A token is active only if the signature, expiry, revocation state, client state and
     * (for access tokens) the live grant state all check out. Clients can only introspect their own tokens.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> introspect(String token, ClientRecord caller) {
        Optional<Jwt> jwt = decode(token);
        if (jwt.isEmpty()) {
            return inactive();
        }
        Jwt j = jwt.get();
        UUID jti;
        try {
            jti = UUID.fromString(j.getId());
        } catch (IllegalArgumentException e) {
            return inactive();
        }
        Instant now = clock.instant();
        var state = tokens.findState(jti);
        if (state.isEmpty() || !state.get().usable(now) || !state.get().clientPk().equals(caller.pk())) {
            return inactive();
        }
        if (state.get().grantId() != null) {
            var grant = grants.find(state.get().grantId());
            if (grant.isEmpty() || !"ACTIVE".equals(grant.get().status(now))) {
                return inactive();
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("active", true);
        out.put("token_type", "Bearer");
        out.put("client_id", j.getSubject());
        out.put("sub", j.getSubject());
        out.put("scope", j.getClaimAsString("scope"));
        out.put("token_use", j.getClaimAsString("token_use"));
        out.put("iss", j.getIssuer() == null ? null : j.getIssuer().toString());
        out.put("aud", j.getAudience());
        out.put("jti", j.getId());
        out.put("iat", j.getIssuedAt().getEpochSecond());
        out.put("exp", j.getExpiresAt().getEpochSecond());
        if (j.getClaimAsString("grant_id") != null) {
            out.put("grant_id", j.getClaimAsString("grant_id"));
        }
        return out;
    }

    /** Revokes one of the caller's own tokens. Unknown/foreign/invalid tokens are ignored (RFC 7009). */
    @Transactional
    public boolean revoke(String token, ClientRecord caller) {
        return decode(token)
                .map(j -> {
                    try {
                        return tokens.revoke(UUID.fromString(j.getId()), caller.pk(), clock.instant().atOffset(ZoneOffset.UTC));
                    } catch (IllegalArgumentException e) {
                        return false;
                    }
                })
                .orElse(false);
    }

    private Optional<Jwt> decode(String token) {
        if (token == null || token.isBlank() || token.length() > 8192) {
            return Optional.empty();
        }
        try {
            return Optional.of(decoder.decode(token));
        } catch (JwtException e) {
            return Optional.empty();
        }
    }

    private static Map<String, Object> inactive() {
        return Map.of("active", false);
    }
}
