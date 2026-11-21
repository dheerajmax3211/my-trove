package com.personalplatform.auth.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "app")
public record AppProperties(Auth auth, @DefaultValue Platform platform) {

    public record Auth(List<String> bootstrapAdminEmails) {
        public Auth {
            bootstrapAdminEmails = bootstrapAdminEmails == null ? List.of() : List.copyOf(bootstrapAdminEmails);
        }
    }

    /**
     * Platform-token settings ({@code app.platform.*}). The key-encryption key is required (base64 of 32 bytes, env
     * {@code APP_PLATFORM_KEY_ENCRYPTION_KEY}); there is deliberately no default, and it never appears in
     * {@link #toString()}.
     */
    public record Platform(
            @DefaultValue("http://localhost:8081") String issuer,
            String keyEncryptionKey,
            @DefaultValue("P30D") Duration keyRotationInterval,
            @DefaultValue("true") boolean autoRotateKeys,
            @DefaultValue("2048") int rsaKeySize) {

        @Override
        public String toString() {
            return "Platform[issuer=" + issuer + ", keyEncryptionKey=<redacted>]";
        }
    }
}
