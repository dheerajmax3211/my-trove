package com.personalplatform.legacy.config;

import com.personalplatform.legacy.notify.LoggingNotificationChannel;
import com.personalplatform.legacy.notify.NotificationChannel;
import com.personalplatform.legacy.notify.OutboxEmailChannel;
import com.personalplatform.legacy.protocol.ChannelType;
import com.personalplatform.notify.NotificationOutbox;
import com.personalplatform.legacy.protocol.SwitchMachine;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableConfigurationProperties(LegacyProperties.class)
@EnableScheduling
public class LegacyConfig {

    /** Everything time-dependent reads this clock; tests replace it. */
    @Bean
    @ConditionalOnMissingBean
    java.time.Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    SwitchMachine switchMachine(LegacyProperties props) {
        return new SwitchMachine(props.lateTolerance());
    }

    /*
     * Default delivery: email goes through the shared outbox (platform-notify, delivered by shared-service); push and
     * SMS are log-only. A real gateway is just another NotificationChannel bean for the same type with a higher
     * precedence (@Order); the registry picks the first channel per type.
     */
    @Bean
    @Order(Ordered.LOWEST_PRECEDENCE)
    NotificationChannel loggingPush() {
        return new LoggingNotificationChannel(ChannelType.PUSH);
    }

    @Bean
    @Order(Ordered.LOWEST_PRECEDENCE)
    NotificationChannel outboxEmail(NotificationOutbox outbox) {
        return new OutboxEmailChannel(outbox);
    }

    @Bean
    @Order(Ordered.LOWEST_PRECEDENCE)
    NotificationChannel loggingSms() {
        return new LoggingNotificationChannel(ChannelType.SMS);
    }
}
