package com.personalplatform.gateway.metering;

import com.personalplatform.gateway.config.GatewayProperties;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Usage metering is on unless {@code gateway.metering.enabled=false}. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "gateway.metering", name = "enabled", havingValue = "true", matchIfMissing = true)
class MeteringConfig {

    @Bean(destroyMethod = "close")
    KafkaUsageSink kafkaUsageSink(GatewayProperties props) {
        return new KafkaUsageSink(props.metering());
    }

    @Bean(destroyMethod = "close")
    UsagePublisher usagePublisher(KafkaUsageSink sink, GatewayProperties props, MeterRegistry registry) {
        return new UsagePublisher(sink, props.metering().bufferSize(), props.metering().batchSize(), registry);
    }

    @Bean
    UsageEventFilter usageEventFilter(UsagePublisher publisher) {
        return new UsageEventFilter(publisher);
    }
}
