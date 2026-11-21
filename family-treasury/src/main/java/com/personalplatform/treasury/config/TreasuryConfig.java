package com.personalplatform.treasury.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
public class TreasuryConfig {

    /** All business time comes from this bean so tests can substitute a fixed, movable clock. */
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    TransactionTemplate transactionTemplate(PlatformTransactionManager tm) {
        return new TransactionTemplate(tm);
    }
}
