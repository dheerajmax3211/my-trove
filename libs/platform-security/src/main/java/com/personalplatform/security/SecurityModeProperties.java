package com.personalplatform.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** {@code app.security.mode}: {@code firebase} (default) or {@code platform}. */
@ConfigurationProperties(prefix = "app.security")
public record SecurityModeProperties(SecurityMode mode) {

    public SecurityModeProperties {
        mode = mode == null ? SecurityMode.FIREBASE : mode;
    }
}
