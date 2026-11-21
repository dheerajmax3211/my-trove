package com.personalplatform.auth.config;

import com.personalplatform.security.FirebaseProperties;
import com.personalplatform.security.IdentityDecoderFactory;
import com.personalplatform.security.PlatformProperties;
import com.personalplatform.security.SecurityMode;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.jwt.JwtDecoder;

/**
 * Behind the gateway every call to auth carries a platform token, while {@code POST /v1/token/exchange} carries a
 * Firebase token. Off by default so standalone runs and the existing tests keep the plain Firebase decoder; the
 * dev stack turns it on with {@code app.platform.accept-platform-tokens=true}.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "app.platform.accept-platform-tokens", havingValue = "true")
class AcceptPlatformTokensConfig {

    @Bean
    JwtDecoder dualTokenDecoder(FirebaseProperties firebase, PlatformProperties platform) {
        return new DualTokenDecoder(
                IdentityDecoderFactory.create(SecurityMode.FIREBASE, firebase, platform),
                IdentityDecoderFactory.create(SecurityMode.PLATFORM, firebase, platform),
                platform.issuer());
    }
}
