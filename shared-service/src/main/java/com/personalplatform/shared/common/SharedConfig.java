package com.personalplatform.shared.common;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
public class SharedConfig {

    /** Injected everywhere that needs "now" so tests can control time. */
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
