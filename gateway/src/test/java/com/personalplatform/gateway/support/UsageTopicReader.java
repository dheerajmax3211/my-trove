package com.personalplatform.gateway.support;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.StringDeserializer;
import tools.jackson.databind.json.JsonMapper;

/** Reads {@code platform.usage.v1} the way platform-service will: JSON values, key = principal id. */
public final class UsageTopicReader implements AutoCloseable {

    public record Event(String key, Map<String, Object> value) {

        public Object get(String field) {
            return value.get(field);
        }

        public String text(String field) {
            Object v = value.get(field);
            return v == null ? null : v.toString();
        }

        public long number(String field) {
            return ((Number) value.get(field)).longValue();
        }
    }

    public static final String TOPIC = "platform.usage.v1";

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final KafkaConsumer<String, String> consumer;
    private final List<Event> seen = new ArrayList<>();

    public UsageTopicReader(String bootstrapServers) {
        Properties p = new Properties();
        p.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        p.put(ConsumerConfig.GROUP_ID_CONFIG, "test-" + UUID.randomUUID());
        p.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        p.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        p.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        this.consumer = new KafkaConsumer<>(p);
        consumer.subscribe(List.of(TOPIC));
    }

    /** Everything seen so far plus whatever arrives within {@code timeout}, stopping early once {@code min} events are in. */
    @SuppressWarnings("unchecked")
    public List<Event> await(int min, Duration timeout) {
        long deadline = System.nanoTime() + timeout.toNanos();
        while (seen.size() < min && System.nanoTime() < deadline) {
            for (ConsumerRecord<String, String> r : consumer.poll(Duration.ofMillis(250))) {
                seen.add(new Event(r.key(), JSON.readValue(r.value(), Map.class)));
            }
        }
        return List.copyOf(seen);
    }

    @Override
    public void close() {
        consumer.close(Duration.ofSeconds(1));
    }
}
