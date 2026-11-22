package com.personalplatform.auth.token;

import com.personalplatform.auth.config.AppProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class ApiKeyVerifierConfig {

    @Bean
    ApiKeyVerifier apiKeyVerifier(AppProperties props) {
        return new PlatformServiceApiKeyVerifier(props.platformService());
    }
}
