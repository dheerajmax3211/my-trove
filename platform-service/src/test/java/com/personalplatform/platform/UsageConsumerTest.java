package com.personalplatform.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.doThrow;

import com.personalplatform.platform.usage.UsageEvent;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.TransientDataAccessResourceException;
import org.springframework.kafka.core.KafkaTemplate;

class UsageConsumerTest extends AbstractPlatformTest {

    static final String TOPIC = "platform.usage.v1";
    static final String DLQ = "platform.usage.v1.dlq";

    @Autowired KafkaTemplate<String, String> kafka;
    @Autowired io.micrometer.core.instrument.MeterRegistry meters;
    @Value("${spring.kafka.consumer.group-id}") String group;

    private double consumed(String outcome) {
        return meters.counter("platform.usage.consumed", "outcome", outcome).count();
    }

    private void publish(String key, String value) throws Exception {
        kafka.send(TOPIC, key, value).get();
    }

    private void publish(Map<String, Object> event) throws Exception {
        publish((String) event.get("principalId"), json.writeValueAsString(event));
    }

    private static Instant at(String iso) {
        return Instant.parse(iso);
    }

    @Test
    void anEventBecomesARowWithEveryField() throws Exception {
        UUID id = UUID.randomUUID();
        publish(event(id, at("2031-04-01T10:00:00Z"), "user-1", "home-pulse", 200, 42));

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(rowCount(id)).isEqualTo(1));
        var row = dsl.fetchOne("select * from platform.usage_events where event_id = ?", id);
        assertThat(row.get("principal_type")).isEqualTo("USER");
        assertThat(row.get("principal_id")).isEqualTo("user-1");
        assertThat(row.get("service")).isEqualTo("home-pulse");
        assertThat(row.get("method")).isEqualTo("GET");
        assertThat(row.get("route_template")).isEqualTo("/v1/items/{id}");
        assertThat(row.get("status")).isEqualTo((short) 200);
        assertThat(row.get("latency_ms")).isEqualTo(42);
        assertThat(row.get("request_bytes")).isEqualTo(120L);
        assertThat(row.get("response_bytes")).isEqualTo(2048L);
        assertThat(row.get("plan")).isEqualTo("FREE");
        assertThat(row.get("rate_limited")).isEqualTo(false);
        assertThat(row.get("request_id")).isEqualTo("req-" + id);
        assertThat(row.get("ts", java.time.OffsetDateTime.class).toInstant()).isEqualTo(at("2031-04-01T10:00:00Z"));
    }

    @Test
    void theSameEventIdDeliveredTwiceLeavesExactlyOneRow() throws Exception {
        UUID id = UUID.randomUUID();
        UUID sentinel = UUID.randomUUID();
        Map<String, Object> e = event(id, at("2031-04-01T10:00:00Z"), "user-dup", "shared", 200, 10);
        double duplicatesBefore = consumed("duplicate");
        double deadLetteredBefore = consumed("dead_lettered");
        publish(e);
        publish(e);
        publish(e);
        // same key -> same partition -> processed in order, so once the sentinel is in, the duplicates have been handled
        publish(event(sentinel, at("2031-04-01T10:00:01Z"), "user-dup", "shared", 200, 10));

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(rowCount(sentinel)).isEqualTo(1));
        assertThat(rowCount(id)).isEqualTo(1);
        // the repeats were recognised as duplicates, not rejected by the database and parked on the DLQ
        assertThat(consumed("duplicate") - duplicatesBefore).isEqualTo(2.0);
        assertThat(consumed("dead_lettered") - deadLetteredBefore).isZero();
    }

    @Test
    void malformedEventsGoToTheDeadLetterTopicAndConsumptionContinues() throws Exception {
        String marker = UUID.randomUUID().toString();
        Map<String, Object> badStatus = event(UUID.randomUUID(), at("2031-04-01T10:00:00Z"), "user-m", "shared", 200, 10);
        badStatus.put("status", 99);
        Map<String, Object> missingEventId = event(UUID.randomUUID(), at("2031-04-01T10:00:00Z"), "user-m", "shared", 200, 10);
        missingEventId.remove("eventId");
        List<String> malformed = List.of(
                "this is not json " + marker,
                "{\"eventId\":\"not-a-uuid\",\"marker\":\"" + marker + "\"}",
                json.writeValueAsString(badStatus).replaceAll("}$", ",\"marker\":\"" + marker + "\"}"),
                json.writeValueAsString(missingEventId).replaceAll("}$", ",\"marker\":\"" + marker + "\"}"));
        for (String m : malformed) {
            publish("user-m", m);
        }
        UUID good = UUID.randomUUID();
        publish(event(good, at("2031-04-01T10:00:02Z"), "user-m", "shared", 200, 10));

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(rowCount(good)).isEqualTo(1));
        List<ConsumerRecord<String, String>> dead = readDlq(records -> records.stream()
                .filter(r -> r.value().contains(marker)).count() >= malformed.size()).stream()
                .filter(r -> r.value().contains(marker)).toList();
        assertThat(dead).extracting(ConsumerRecord::value).containsExactlyInAnyOrderElementsOf(malformed);
        assertThat(new String(dead.get(0).headers().lastHeader("x-error-reason").value())).isNotBlank();
        assertThat(dsl.fetchValue("select count(*) from platform.usage_events where principal_id = 'user-m'"))
                .isEqualTo(1L);
    }

    @Test
    void aDatabaseFailureNeitherLosesNorDuplicatesTheEventAndOffsetsAreCommittedOnlyAfterTheInsert() throws Exception {
        UUID id = UUID.randomUUID();
        // the first two attempts fail as a transient database outage would; the error handler must retry the same record
        doThrow(new TransientDataAccessResourceException("database down"))
                .doThrow(new TransientDataAccessResourceException("database still down"))
                .doCallRealMethod()
                .when(usageRepository).insertIdempotent(any(UsageEvent.class));

        publish(event(id, at("2031-04-01T10:00:00Z"), "user-fail", "shared", 200, 10));

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(rowCount(id)).isEqualTo(1));
        // ...and the group offset moved past the record only once the insert had happened
        await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> assertThat(committedLag()).isZero());
        assertThat(rowCount(id)).isEqualTo(1);
    }

    // ----------------------------------------------------------------- helpers

    private long committedLag() throws Exception {
        try (AdminClient admin = AdminClient.create(Map.<String, Object>of("bootstrap.servers", KAFKA.getBootstrapServers()))) {
            Map<TopicPartition, OffsetAndMetadata> committed = admin.listConsumerGroupOffsets(group)
                    .partitionsToOffsetAndMetadata().get();
            var latest = admin.listOffsets(committed.keySet().stream().collect(java.util.stream.Collectors.toMap(tp -> tp,
                    tp -> org.apache.kafka.clients.admin.OffsetSpec.latest()))).all().get();
            return committed.entrySet().stream()
                    .filter(e -> e.getKey().topic().equals(TOPIC))
                    .mapToLong(e -> latest.get(e.getKey()).offset() - e.getValue().offset()).sum();
        }
    }

    private List<ConsumerRecord<String, String>> readDlq(java.util.function.Predicate<List<ConsumerRecord<String, String>>> done) {
        Properties p = new Properties();
        p.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers());
        p.put(ConsumerConfig.GROUP_ID_CONFIG, "test-dlq-" + UUID.randomUUID());
        p.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        p.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        p.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        List<ConsumerRecord<String, String>> all = new ArrayList<>();
        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(p)) {
            consumer.subscribe(List.of(DLQ));
            long deadline = System.currentTimeMillis() + 30_000;
            while (System.currentTimeMillis() < deadline) {
                consumer.poll(Duration.ofMillis(500)).forEach(all::add);
                if (done.test(all)) {
                    break;
                }
            }
        }
        return all;
    }
}
