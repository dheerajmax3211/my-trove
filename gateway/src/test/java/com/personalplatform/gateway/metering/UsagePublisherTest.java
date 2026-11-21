package com.personalplatform.gateway.metering;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class UsagePublisherTest {

    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
    private UsagePublisher publisher;

    @AfterEach
    void close() {
        if (publisher != null) {
            publisher.close();
        }
    }

    private static UsageEvent event(int n) {
        return new UsageEvent("id-" + n, "2026-11-21T00:00:00Z", "req-" + n, "USER", "u" + n, null, "waiting-on", "GET",
                "/v1/items", 200, 1, 0, 0, "FREE", false);
    }

    private double dropped() {
        return registry.find("gateway.usage.dropped").counters().stream().mapToDouble(Counter::count).sum();
    }

    @Test
    void eventsAreDeliveredInBatchesInOrder() {
        List<UsageEvent> delivered = Collections.synchronizedList(new ArrayList<>());
        publisher = new UsagePublisher(batch -> {
            delivered.addAll(batch);
            return 0;
        }, 100, 10, registry);

        for (int i = 0; i < 25; i++) {
            publisher.publish(event(i));
        }

        await().atMost(Duration.ofSeconds(5)).until(() -> delivered.size() == 25);
        assertThat(delivered).extracting(UsageEvent::eventId)
                .containsExactlyElementsOf(java.util.stream.IntStream.range(0, 25).mapToObj(i -> "id-" + i).toList());
        assertThat(dropped()).isZero();
    }

    @Test
    void aStuckSinkNeverBlocksPublishersAndTheOldestEventsAreDroppedAndCounted() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        List<UsageEvent> delivered = Collections.synchronizedList(new ArrayList<>());
        publisher = new UsagePublisher(batch -> {
            release.await(30, TimeUnit.SECONDS);
            delivered.addAll(batch);
            return 0;
        }, 10, 1, registry);

        long start = System.nanoTime();
        for (int i = 0; i < 1_000; i++) {
            publisher.publish(event(i));
        }
        long elapsedMs = Duration.ofNanos(System.nanoTime() - start).toMillis();

        assertThat(elapsedMs).as("1,000 publishes against a sink that never answers").isLessThan(500);
        // one event is in the worker's hands, at most 10 wait in the buffer, the rest were dropped
        assertThat(dropped()).isGreaterThanOrEqualTo(1_000 - 11);

        release.countDown();
        await().atMost(Duration.ofSeconds(5)).until(() -> delivered.size() >= 10);
        // what survives is the newest data
        assertThat(delivered.get(delivered.size() - 1).eventId()).isEqualTo("id-999");
    }

    @Test
    void eventsThatTheSinkFailsToSendAreCountedAsDropped() {
        publisher = new UsagePublisher(batch -> {
            throw new IllegalStateException("broker unreachable");
        }, 100, 10, registry);

        for (int i = 0; i < 7; i++) {
            publisher.publish(event(i));
        }

        await().atMost(Duration.ofSeconds(5)).until(() -> dropped() == 7);
    }

    @Test
    void partialFailuresAreCountedToo() {
        publisher = new UsagePublisher(batch -> 2, 100, 10, registry);

        for (int i = 0; i < 4; i++) {
            publisher.publish(event(i));
        }

        await().atMost(Duration.ofSeconds(5)).until(() -> dropped() >= 2);
    }
}
