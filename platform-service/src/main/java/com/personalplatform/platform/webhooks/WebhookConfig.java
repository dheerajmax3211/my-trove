package com.personalplatform.platform.webhooks;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@EnableConfigurationProperties(WebhookProperties.class)
class WebhookConfig {

    @Bean
    WebhookSender webhookSender() {
        return new WebhookSender.Http();
    }

    /** Idempotent topic creation, as for the usage topics. */
    @Bean
    KafkaAdmin.NewTopics domainTopics(WebhookProperties props) {
        return new KafkaAdmin.NewTopics(
                TopicBuilder.name(props.domainTopic()).partitions(3).replicas(1).build(),
                TopicBuilder.name(props.domainDlqTopic()).partitions(1).replicas(1).build());
    }
}
