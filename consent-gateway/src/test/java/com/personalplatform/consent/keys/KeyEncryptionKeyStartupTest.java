package com.personalplatform.consent.keys;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.consent.config.ConsentConfig;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/** The service must refuse to start without a key-encryption key, except under the explicit `dev` profile. */
class KeyEncryptionKeyStartupTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(ConsentConfig.class)
            .withInitializer(new ConfigDataApplicationContextInitializer());

    @Test
    void failsToStartWithoutAKeyInTheDefaultProfile() {
        runner.run(ctx -> {
            assertThat(ctx).hasFailed();
            assertThat(rootMessage(ctx.getStartupFailure())).contains("CONSENT_KEY_ENCRYPTION_KEY");
        });
    }

    @Test
    void failsToStartWithAMalformedKey() {
        runner.withPropertyValues("app.consent.key-encryption-key=c2hvcnQ=").run(ctx -> assertThat(ctx).hasFailed());
        runner.withPropertyValues("app.consent.key-encryption-key=%%%not-base64%%%").run(ctx -> assertThat(ctx).hasFailed());
    }

    @Test
    void startsWithAProperKey() {
        runner.withPropertyValues("app.consent.key-encryption-key=dGVzdC1vbmx5LWtleS1lbmNyeXB0aW9uLWtleS0zMmI=")
                .run(ctx -> assertThat(ctx).hasNotFailed().hasSingleBean(KeyCipher.class));
    }

    @Test
    void devProfileProvidesAnObviouslyInsecureDefault() {
        runner.withPropertyValues("spring.profiles.active=dev").run(ctx -> {
            assertThat(ctx).hasNotFailed().hasSingleBean(KeyCipher.class);
        });
    }

    private static String rootMessage(Throwable t) {
        Throwable r = t;
        while (r.getCause() != null) {
            r = r.getCause();
        }
        return String.valueOf(r.getMessage());
    }
}
