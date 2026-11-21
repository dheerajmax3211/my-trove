package com.personalplatform.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Where platform tokens come from: the issuer ({@code iss}) and the JWKS that holds its public keys.
 * {@code app.platform.jwk-set-uri} defaults to {@code <issuer>/.well-known/jwks.json}, the path {@code auth} serves.
 */
@ConfigurationProperties(prefix = "app.platform")
public record PlatformProperties(String issuer, String jwkSetUri) {

    public static final String DEFAULT_ISSUER = "http://localhost:8081";
    public static final String AUDIENCE = "trove-platform";
    public static final String TOKEN_USE_PLATFORM = "platform";
    public static final String TOKEN_USE_SERVICE = "service";

    public PlatformProperties {
        issuer = issuer == null || issuer.isBlank() ? DEFAULT_ISSUER : issuer;
        jwkSetUri = jwkSetUri == null || jwkSetUri.isBlank() ? stripTrailingSlash(issuer) + "/.well-known/jwks.json" : jwkSetUri;
    }

    private static String stripTrailingSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
