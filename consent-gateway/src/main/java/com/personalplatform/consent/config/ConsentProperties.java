package com.personalplatform.consent.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Gateway settings ({@code app.consent.*}). The key-encryption key is never printed by {@link #toString()}. */
@ConfigurationProperties(prefix = "app.consent")
public record ConsentProperties(
        @DefaultValue("http://localhost:8084") String issuer,
        @DefaultValue("consent-gateway") String audience,
        @DefaultValue("PT5M") Duration accessTokenTtl,
        @DefaultValue("PT5M") Duration clientTokenTtl,
        @DefaultValue("PT30S") Duration clockSkew,
        @DefaultValue("P7D") Duration requestTtl,
        @DefaultValue("P365D") Duration maxGrantDuration,
        @DefaultValue("P30D") Duration keyRotationInterval,
        @DefaultValue("true") boolean autoRotateKeys,
        @DefaultValue("2048") int rsaKeySize,
        String keyEncryptionKey) {

    @Override
    public String toString() {
        return "ConsentProperties[issuer=" + issuer + ", audience=" + audience + ", keyEncryptionKey=<redacted>]";
    }
}
