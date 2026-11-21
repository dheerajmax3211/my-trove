package com.personalplatform.platform.config;

import com.personalplatform.platform.usage.UsageProperties;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.kafka.listener.CommonErrorHandler;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.ExponentialBackOff;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(UsageProperties.class)
class PlatformConfig {

    /** UTC wall clock; tests replace it to move across month boundaries. */
    @Bean
    @ConditionalOnMissingBean(Clock.class)
    Clock clock() {
        return Clock.systemUTC();
    }

    /**
     * A record whose insert failed is retried forever (exponential backoff capped at {@code retryMax}) and the offset
     * is never committed past it: the database being down must delay events, never drop them. Records that can never
     * be stored do not reach this handler, the listener dead-letters them itself.
     */
    @Bean
    CommonErrorHandler usageErrorHandler(UsageProperties props) {
        ExponentialBackOff backOff = new ExponentialBackOff(props.retryInitial().toMillis(), 2.0);
        backOff.setMaxInterval(props.retryMax().toMillis());
        return new DefaultErrorHandler(backOff);
    }

    /** Idempotent topic creation (a no-op when the broker already has them); a broker that is down at boot is not fatal. */
    @Bean
    KafkaAdmin.NewTopics usageTopics(UsageProperties props) {
        return new KafkaAdmin.NewTopics(
                TopicBuilder.name(props.topic()).partitions(3).replicas(1).build(),
                TopicBuilder.name(props.dlqTopic()).partitions(1).replicas(1).build());
    }
}
