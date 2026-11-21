package com.personalplatform.consent.config;

import com.personalplatform.consent.keys.KeyCipher;
import com.personalplatform.consent.policy.PolicyEngine;
import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration
@EnableScheduling
@EnableConfigurationProperties(ConsentProperties.class)
public class ConsentConfig {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    PolicyEngine policyEngine() {
        return new PolicyEngine();
    }

    /** Client secrets: delegating encoder, bcrypt by default ({bcrypt} prefix lets us migrate the KDF later). */
    @Bean
    PasswordEncoder clientSecretEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    /** Fails fast at startup if the key-encryption key is missing or malformed. */
    @Bean
    KeyCipher keyCipher(ConsentProperties props) {
        return KeyCipher.fromBase64(props.keyEncryptionKey());
    }
}
