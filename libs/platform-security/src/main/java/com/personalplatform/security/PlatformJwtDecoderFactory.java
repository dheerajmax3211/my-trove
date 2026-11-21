package com.personalplatform.security;

import java.util.List;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

/**
 * Verifies platform tokens issued by {@code auth}: RS256 only (so {@code alg: none} and HMAC downgrades are refused),
 * key looked up by {@code kid} in the issuer's JWKS, exact issuer, audience {@code trove-platform}, expiry,
 * {@code token_use} of {@code platform} or {@code service}, and a non-empty subject.
 */
public final class PlatformJwtDecoderFactory {

    private PlatformJwtDecoderFactory() {}

    public static JwtDecoder create(PlatformProperties props) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(props.jwkSetUri())
                .jwsAlgorithm(SignatureAlgorithm.RS256)
                .build();
        decoder.setJwtValidator(validator(props.issuer()));
        return decoder;
    }

    /** The claim checks, shared with the local decoder of the test helper so both enforce identical rules. */
    public static OAuth2TokenValidator<Jwt> validator(String issuer) {
        return new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(issuer), expiryPresent(), audience(), tokenUse(), subjectPresent());
    }

    private static OAuth2TokenValidator<Jwt> audience() {
        OAuth2Error error = new OAuth2Error("invalid_token", "Token audience is not " + PlatformProperties.AUDIENCE, null);
        return jwt -> jwt.getAudience() != null && jwt.getAudience().contains(PlatformProperties.AUDIENCE)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(error);
    }

    private static OAuth2TokenValidator<Jwt> tokenUse() {
        OAuth2Error error = new OAuth2Error("invalid_token", "Token is not a platform or service token", null);
        List<String> allowed = List.of(PlatformProperties.TOKEN_USE_PLATFORM, PlatformProperties.TOKEN_USE_SERVICE);
        return jwt -> {
            Object tokenUse = jwt.getClaims().get("token_use");
            return tokenUse instanceof String s && allowed.contains(s)
                    ? OAuth2TokenValidatorResult.success()
                    : OAuth2TokenValidatorResult.failure(error);
        };
    }

    /** The default timestamp validator lets a token with no {@code exp} through; a platform token must expire. */
    private static OAuth2TokenValidator<Jwt> expiryPresent() {
        OAuth2Error error = new OAuth2Error("invalid_token", "Token has no expiry", null);
        return jwt -> jwt.getExpiresAt() != null
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(error);
    }

    private static OAuth2TokenValidator<Jwt> subjectPresent() {
        OAuth2Error error = new OAuth2Error("invalid_token", "Token has no subject", null);
        return jwt -> jwt.getSubject() != null && !jwt.getSubject().isBlank()
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(error);
    }
}
