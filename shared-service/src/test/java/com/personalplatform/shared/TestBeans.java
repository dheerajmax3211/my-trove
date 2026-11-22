package com.personalplatform.shared;

import com.personalplatform.notify.NotificationSender;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Predicate;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** Controllable clock and sender shared by all integration tests. */
@TestConfiguration(proxyBeanMethods = false)
class TestBeans {

    static final Instant T0 = Instant.parse("2026-01-15T10:00:00Z");

    /** Records deliveries; {@link #failWhen} decides which attempts throw. */
    static class RecordingSender implements NotificationSender {
        final List<Message> delivered = new CopyOnWriteArrayList<>();
        final List<Message> attempts = new CopyOnWriteArrayList<>();
        volatile Predicate<Message> failWhen = m -> false;

        @Override
        public void send(Message message) throws Exception {
            attempts.add(message);
            if (failWhen.test(message)) {
                throw new IllegalStateException("simulated provider outage");
            }
            delivered.add(message);
        }

        void reset() {
            delivered.clear();
            attempts.clear();
            failWhen = m -> false;
        }
    }

    @Bean
    @Primary
    MutableClock testClock() {
        return new MutableClock(T0);
    }

    @Bean
    RecordingSender recordingSender() {
        return new RecordingSender();
    }
}
