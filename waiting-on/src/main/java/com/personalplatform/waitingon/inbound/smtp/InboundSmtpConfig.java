package com.personalplatform.waitingon.inbound.smtp;

import com.personalplatform.waitingon.inbound.InboundEmailService;
import com.personalplatform.waitingon.inbound.ReplyAddresses;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** The SMTP listener exists only with {@code app.inbound.smtp.enabled=true} ({@code INBOUND_SMTP_ENABLED}). */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(InboundSmtpProperties.class)
public class InboundSmtpConfig {

    @Bean
    @ConditionalOnProperty(prefix = "app.inbound.smtp", name = "enabled", havingValue = "true")
    InboundSmtpServer inboundSmtpServer(InboundSmtpProperties props, InboundEmailService service,
            ReplyAddresses addresses, Clock clock) {
        return new InboundSmtpServer(props, service, addresses, clock);
    }
}
