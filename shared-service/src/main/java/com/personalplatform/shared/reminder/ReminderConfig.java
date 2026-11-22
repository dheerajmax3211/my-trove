package com.personalplatform.shared.reminder;

import com.personalplatform.notify.ContactDirectory;
import com.personalplatform.notify.NotificationRelay;
import com.personalplatform.notify.NotificationSender;
import java.time.Clock;
import org.jooq.DSLContext;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Configuration
@EnableConfigurationProperties(SchedulerProperties.class)
public class ReminderConfig {

    @Bean
    ReminderEngine reminderEngine(DSLContext dsl, PlatformTransactionManager tm, Clock clock, SchedulerProperties p) {
        return new ReminderEngine(dsl, new TransactionTemplate(tm), clock, p.batchSize());
    }

    @Bean
    NotificationRelay notificationRelay(DSLContext dsl, PlatformTransactionManager tm, Clock clock,
            NotificationSender sender, ContactDirectory contacts, SchedulerProperties p) {
        return new NotificationRelay(dsl, new TransactionTemplate(tm), clock, sender, contacts, p.maxAttempts(),
                p.baseBackoff(), p.maxBackoff());
    }
}
