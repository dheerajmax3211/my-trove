package com.personalplatform.waitingon.inbound.smtp;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class InboundSmtpConfigTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(InboundSmtpConfig.class);

    @Test
    void offByDefault() {
        runner.run(ctx -> assertThat(ctx).doesNotHaveBean(InboundSmtpServer.class));
        runner.withPropertyValues("app.inbound.smtp.enabled=false")
                .run(ctx -> assertThat(ctx).doesNotHaveBean(InboundSmtpServer.class));
    }

    @Test
    void bindsProperties() {
        runner.withPropertyValues("app.inbound.smtp.port=2626", "app.inbound.smtp.max-message-size=1MB",
                        "app.inbound.smtp.bind-address=0.0.0.0")
                .run(ctx -> {
                    InboundSmtpProperties p = ctx.getBean(InboundSmtpProperties.class);
                    assertThat(p.enabled()).isFalse();
                    assertThat(p.port()).isEqualTo(2626);
                    assertThat(p.maxMessageSize().toBytes()).isEqualTo(1L << 20);
                    assertThat(p.bindAddress()).isEqualTo("0.0.0.0");
                });
    }
}
