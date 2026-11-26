package com.personalplatform.waitingon.inbound.smtp;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class WindowCounterTest {

    /** A clock the test moves by hand. */
    static final class MutableClock extends Clock {
        Instant now = Instant.parse("2026-11-26T10:00:00Z");

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    @Test
    void allowsUpToTheLimitPerKeyPerWindowThenResets() {
        MutableClock clock = new MutableClock();
        WindowCounter c = new WindowCounter(3, Duration.ofMinutes(1), clock);
        assertThat(c.tryAcquire("1.2.3.4")).isTrue();
        assertThat(c.tryAcquire("1.2.3.4")).isTrue();
        assertThat(c.tryAcquire("1.2.3.4")).isTrue();
        assertThat(c.tryAcquire("1.2.3.4")).isFalse();
        assertThat(c.tryAcquire("5.6.7.8")).as("other sources are counted separately").isTrue();

        clock.now = clock.now.plusSeconds(59);
        assertThat(c.tryAcquire("1.2.3.4")).isFalse();
        clock.now = clock.now.plusSeconds(1);
        assertThat(c.tryAcquire("1.2.3.4")).as("new window").isTrue();
    }

    @Test
    void connectionCountersEnforcePerConnectionLimits() {
        InboundSmtpProperties props = new InboundSmtpProperties(true, 0, null, null, null, null, null, null, null,
                null, 2, 3);
        SmtpLimits limits = new SmtpLimits(props, Clock.systemUTC());
        SmtpLimits.Connection conn = limits.connection("unknown-session");
        assertThat(conn.tryStartMessage()).isTrue();
        assertThat(conn.tryStartMessage()).isTrue();
        assertThat(conn.tryStartMessage()).isFalse();
        assertThat(conn.refusedRecipient()).isFalse();
        assertThat(conn.refusedRecipient()).isFalse();
        assertThat(conn.refusedRecipient()).as("third refusal drops the connection").isTrue();
    }

    @Test
    void defaultsMatchTheDocumentedOnes() {
        InboundSmtpProperties p = new InboundSmtpProperties(false, null, null, null, null, null, null, null, null,
                null, null, null);
        assertThat(p.port()).isEqualTo(2525);
        assertThat(p.bindAddress()).isEqualTo("127.0.0.1");
        assertThat(p.maxMessageSize().toKilobytes()).isEqualTo(512);
        assertThat(p.connectionTimeout()).isEqualTo(Duration.ofSeconds(60));
        assertThat(p.maxConcurrentPerIp()).isEqualTo(3);
        assertThat(p.maxMessagesPerConnection()).isEqualTo(5);
    }
}
