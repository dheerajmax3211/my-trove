package com.personalplatform.auth.config;

import com.personalplatform.auth.token.KeyCipher;
import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
@EnableConfigurationProperties(AppProperties.class)
public class AuthConfig {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    /** Fails fast at startup if the key-encryption key is missing or malformed. */
    @Bean
    KeyCipher keyCipher(AppProperties props) {
        return KeyCipher.fromBase64(props.platform().keyEncryptionKey());
    }
}
