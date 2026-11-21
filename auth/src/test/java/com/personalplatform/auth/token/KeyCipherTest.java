package com.personalplatform.auth.token;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.auth.config.AuthConfig;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class KeyCipherTest {

    private static final String KEK = "dGVzdC1vbmx5LWtleS1lbmNyeXB0aW9uLWtleS0zMmI=";

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(AuthConfig.class)
            .withInitializer(new ConfigDataApplicationContextInitializer());

    private static String randomKek() {
        byte[] raw = new byte[32];
        new SecureRandom().nextBytes(raw);
        return Base64.getEncoder().encodeToString(raw);
    }

    @Test
    void roundTripsAndBindsCiphertextToTheKeyId() {
        KeyCipher cipher = KeyCipher.fromBase64(KEK);
        byte[] secret = "pkcs8-bytes".getBytes(StandardCharsets.UTF_8);

        byte[] blob = cipher.encrypt("kid-1", secret);

        assertThat(blob).isNotEqualTo(secret);
        assertThat(cipher.decrypt("kid-1", blob)).isEqualTo(secret);
        assertThatThrownBy(() -> cipher.decrypt("kid-2", blob)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void aDifferentKeyEncryptionKeyCannotDecrypt() {
        byte[] blob = KeyCipher.fromBase64(KEK).encrypt("kid-1", new byte[] {1, 2, 3});
        KeyCipher other = KeyCipher.fromBase64(randomKek());
        assertThatThrownBy(() -> other.decrypt("kid-1", blob))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageNotContaining(KEK);
    }

    @Test
    void failsToStartWithoutAKeyEncryptionKey() {
        runner.run(ctx -> {
            assertThat(ctx).hasFailed();
            assertThat(rootMessage(ctx.getStartupFailure())).contains("APP_PLATFORM_KEY_ENCRYPTION_KEY");
        });
    }

    @Test
    void failsToStartWithAMalformedKeyEncryptionKey() {
        runner.withPropertyValues("app.platform.key-encryption-key=c2hvcnQ=").run(ctx -> assertThat(ctx).hasFailed());
        runner.withPropertyValues("app.platform.key-encryption-key=%%%not-base64%%%")
                .run(ctx -> assertThat(ctx).hasFailed());
    }

    @Test
    void startsWithAProperKeyEncryptionKey() {
        runner.withPropertyValues("app.platform.key-encryption-key=" + KEK)
                .run(ctx -> assertThat(ctx).hasNotFailed().hasSingleBean(KeyCipher.class));
    }

    private static String rootMessage(Throwable t) {
        Throwable r = t;
        while (r.getCause() != null) {
            r = r.getCause();
        }
        return String.valueOf(r.getMessage());
    }
}
