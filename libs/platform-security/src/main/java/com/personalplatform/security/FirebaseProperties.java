package com.personalplatform.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Which Firebase project's ID tokens a service accepts. */
@ConfigurationProperties(prefix = "app.firebase")
public record FirebaseProperties(String projectId, String jwkSetUri) {

    public static final String DEFAULT_JWK_SET_URI =
            "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

    public FirebaseProperties {
        jwkSetUri = jwkSetUri == null || jwkSetUri.isBlank() ? DEFAULT_JWK_SET_URI : jwkSetUri;
    }
}
