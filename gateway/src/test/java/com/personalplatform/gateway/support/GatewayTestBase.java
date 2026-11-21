package com.personalplatform.gateway.support;

import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

import com.personalplatform.gateway.security.ExchangeCache;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/** Boots the gateway on a random port against {@link Backends}; metering is off unless a test turns it on. */
@SpringBootTest(webEnvironment = RANDOM_PORT, properties = {"gateway.metering.enabled=false"})
@Import(GatewayTestBase.ClockConfig.class)
public abstract class GatewayTestBase {

    protected static final Backends backends = Backends.get();

    @LocalServerPort
    protected int port;

    protected WebTestClient client;

    @Autowired
    protected MutableClock clock;

    @Autowired
    private ExchangeCache exchangeCache;

    @DynamicPropertySource
    static void backendProperties(DynamicPropertyRegistry registry) {
        backends.register(registry);
    }

    @BeforeEach
    void resetGatewayState() {
        backends.reset();
        exchangeCache.clear();
        client = WebTestClient.bindToServer()
                .baseUrl("http://localhost:" + port)
                .responseTimeout(Duration.ofSeconds(15))
                .build();
    }

    protected static String bearer(String credential) {
        return "Bearer " + credential;
    }

    /** A clock the test can move, replacing the system clock inside the gateway. */
    public static final class MutableClock extends Clock {

        private final AtomicReference<Instant> now = new AtomicReference<>(Instant.now());

        public void advance(Duration d) {
            now.updateAndGet(i -> i.plus(d));
        }

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
            return now.get();
        }
    }

    @TestConfiguration
    static class ClockConfig {

        @Bean
        @Primary
        MutableClock testClock() {
            return new MutableClock();
        }
    }
}
