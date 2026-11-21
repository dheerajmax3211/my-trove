package com.personalplatform.security;

import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

/**
 * Verifies Firebase ID tokens: RS256 signature via Google's JWKS, issuer
 * {@code https://securetoken.google.com/<project>}, audience = project id,
 * expiry (default validators) and a non-empty subject.
 */
public final class FirebaseJwtDecoderFactory {

    private FirebaseJwtDecoderFactory() {}

    public static JwtDecoder create(FirebaseProperties props) {
        String projectId = props.projectId();
        if (projectId == null || projectId.isBlank()) {
            throw new IllegalStateException("app.firebase.project-id (FIREBASE_PROJECT_ID) must be set");
        }
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(props.jwkSetUri()).build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer("https://securetoken.google.com/" + projectId),
                audience(projectId),
                subjectPresent()));
        return decoder;
    }

    private static OAuth2TokenValidator<Jwt> audience(String projectId) {
        OAuth2Error error = new OAuth2Error("invalid_token", "Token audience does not match Firebase project", null);
        return jwt -> jwt.getAudience() != null && jwt.getAudience().contains(projectId)
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
