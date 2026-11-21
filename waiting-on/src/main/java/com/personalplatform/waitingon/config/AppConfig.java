package com.personalplatform.waitingon.config;

import com.personalplatform.waitingon.inbound.InboundProperties;
import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(InboundProperties.class)
public class AppConfig {

    /** Injected everywhere instead of calling now() so tests can pin time. */
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
