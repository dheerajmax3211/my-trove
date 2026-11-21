package com.personalplatform.gateway.metering;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

import com.personalplatform.gateway.support.GatewayTestBase;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.utility.DockerImageName;

/** Review Focus 3: metering must never block or fail a request, even with Kafka gone. */
@SpringBootTest(webEnvironment = RANDOM_PORT, properties = {"gateway.metering.enabled=true"})
class UsageMeteringKafkaDownTest extends GatewayTestBase {

    private static final String CRED = "u|perf|DEVELOPER|products:use";

    static final KafkaContainer KAFKA = new KafkaContainer(DockerImageName.parse("apache/kafka:latest"));

    static {
        KAFKA.start();
    }

    @Autowired
    MeterRegistry registry;

    @DynamicPropertySource
    static void kafka(DynamicPropertyRegistry registry) {
        registry.add("gateway.metering.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
    }

    private double dropped() {
        return registry.find("gateway.usage.dropped").counters().stream().mapToDouble(Counter::count).sum();
    }

    /** p99 of sequential request latency, in milliseconds. */
    private double p99Millis(int requests) {
        List<Long> nanos = new ArrayList<>();
        for (int i = 0; i < requests; i++) {
            long start = System.nanoTime();
            var result = client.get().uri("/api/waiting-on/v1/items")
                    .header(HttpHeaders.AUTHORIZATION, bearer(CRED)) // DEVELOPER plan: far from its limit
                    .exchange()
                    .expectStatus().isOk()
                    .expectBody().returnResult();
            assertThat(result.getResponseBodyContent()).isNotEmpty();
            nanos.add(System.nanoTime() - start);
        }
        Collections.sort(nanos);
        return nanos.get((int) Math.ceil(nanos.size() * 0.99) - 1) / 1_000_000.0;
    }

    @Test
    void withKafkaStoppedRequestsStillSucceedWithoutMeasurableDelayAndDropsAreCounted() {
        // warm up (JIT, connections, producer metadata) and take a baseline with Kafka up
        p99Millis(50);
        double baseline = p99Millis(300);
        double droppedBefore = dropped();

        KAFKA.stop();

        double withKafkaDown = p99Millis(300);

        System.out.printf("usage-metering p99: kafka up %.1f ms, kafka down %.1f ms%n", baseline, withKafkaDown);
        assertThat(withKafkaDown - baseline)
                .as("p99 added latency with Kafka down (baseline %.1f ms, down %.1f ms)", baseline, withKafkaDown)
                .isLessThan(50.0);
        // the publisher gives up on batches it cannot deliver and says so, within the producer's own timeouts
        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(dropped()).isGreaterThan(droppedBefore));
        // and the gateway is still serving
        client.get().uri("/api/waiting-on/v1/items").header(HttpHeaders.AUTHORIZATION, bearer(CRED))
                .exchange().expectStatus().isOk();
    }
}
