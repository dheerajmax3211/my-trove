package com.personalplatform.shared;

import static org.assertj.core.api.Assertions.assertThat;

import com.personalplatform.shared.reminder.LoggingNotificationSender;
import com.personalplatform.shared.reminder.ReminderScheduler;
import com.personalplatform.shared.reminder.ReminderService;
import java.time.Duration;
import java.time.Instant;
import org.jooq.DSLContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

/** The out-of-the-box configuration: scheduler on, real clock, built-in logging sender. */
@SpringBootTest
@Import({TestcontainersConfiguration.class, StubJwtConfig.class})
@TestPropertySource(properties = {"app.files.local-root=target/test-blobs-default"})
class DefaultWiringTests {

    @Autowired ReminderScheduler scheduler;
    @Autowired LoggingNotificationSender loggingSender;
    @Autowired ReminderService reminders;
    @Autowired DSLContext dsl;

    @Test
    void schedulerTickFiresAndRelaysThroughTheLoggingSender() {
        var r = reminders.create("wiring-user", "wired", Instant.now().minus(Duration.ofHours(1)), null, null);
        scheduler.tick();
        assertThat(dsl.fetchValue("select status from shared.notifications where reminder_id = ?", r.id())).isEqualTo("SENT");
        assertThat(dsl.fetchValue("select status from shared.reminders where id = ?", r.id())).isEqualTo("COMPLETED");
    }
}
