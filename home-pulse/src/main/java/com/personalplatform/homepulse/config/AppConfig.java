package com.personalplatform.homepulse.config;

import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@EnableConfigurationProperties(HomePulseProperties.class)
public class AppConfig {

    /** Every time-dependent component takes this clock; tests replace it with a fixed one. */
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
