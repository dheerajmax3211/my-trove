package com.personalplatform.waitingon.config;

import com.personalplatform.waitingon.notify.LoggingNotificationPort;
import com.personalplatform.waitingon.notify.NotificationPort;
import com.personalplatform.waitingon.reply.ReplyClassifier;
import com.personalplatform.waitingon.reply.RuleBasedReplyClassifier;
import com.personalplatform.waitingon.temporal.NoopFollowUpScheduler;
import com.personalplatform.waitingon.temporal.TemporalProperties;
import com.personalplatform.waitingon.workflow.FollowUpScheduler;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

/**
 * Replaceable defaults. An auto-configuration so that {@code @ConditionalOnMissingBean} is evaluated after the
 * application's own beans: define your own {@link NotificationPort} (real email) or {@link ReplyClassifier} (LLM)
 * and these back off.
 */
@AutoConfiguration
@EnableConfigurationProperties(TemporalProperties.class)
public class WaitingOnDefaultsAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    NotificationPort loggingNotificationPort() {
        return new LoggingNotificationPort();
    }

    @Bean
    @ConditionalOnMissingBean
    ReplyClassifier ruleBasedReplyClassifier() {
        return new RuleBasedReplyClassifier();
    }

    @Bean
    @ConditionalOnProperty(prefix = "app.temporal", name = "enabled", havingValue = "false")
    FollowUpScheduler noopFollowUpScheduler() {
        return new NoopFollowUpScheduler();
    }
}
