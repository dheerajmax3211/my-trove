package com.personalplatform.consent.keys;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.DefaultJOSEObjectTypeVerifier;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import com.personalplatform.consent.config.ConsentProperties;
import java.time.Clock;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

/**
 * Verifies the gateway's own tokens: RS256 only (no "alg: none", no HS256 confusion), header typ {@code at+jwt},
 * signature by a key from our JWKS selected by {@code kid}, issuer, audience and expiry (with the injected clock).
 */
public final class GatewayJwtDecoderFactory {

    public static final JOSEObjectType TOKEN_TYPE = new JOSEObjectType("at+jwt");

    private GatewayJwtDecoderFactory() {}

    public static JwtDecoder create(JWKSource<SecurityContext> keys, ConsentProperties props, Clock clock) {
        DefaultJWTProcessor<SecurityContext> processor = new DefaultJWTProcessor<>();
        processor.setJWSTypeVerifier(new DefaultJOSEObjectTypeVerifier<>(TOKEN_TYPE));
        processor.setJWSKeySelector(new JWSVerificationKeySelector<>(JWSAlgorithm.RS256, keys));
        // Nimbus' default claims verifier uses the system clock; claims are validated below with the injected clock.
        processor.setJWTClaimsSetVerifier((claims, ctx) -> {});

        JwtTimestampValidator timestamps = new JwtTimestampValidator(props.clockSkew());
        timestamps.setClock(clock);

        NimbusJwtDecoder decoder = new NimbusJwtDecoder(processor);
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                timestamps, new JwtIssuerValidator(props.issuer()), audience(props.audience()), subjectAndId()));
        return decoder;
    }

    private static OAuth2TokenValidator<Jwt> audience(String expected) {
        OAuth2Error error = new OAuth2Error("invalid_token", "Wrong audience", null);
        return jwt -> jwt.getAudience() != null && jwt.getAudience().contains(expected)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(error);
    }

    private static OAuth2TokenValidator<Jwt> subjectAndId() {
        OAuth2Error error = new OAuth2Error("invalid_token", "Token is missing sub or jti", null);
        return jwt -> jwt.getSubject() != null && !jwt.getSubject().isBlank() && jwt.getId() != null
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(error);
    }
}
