package com.personalplatform.gateway.metering;

import com.personalplatform.gateway.config.GatewayProperties;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;
import reactor.core.publisher.Flux;
import reactor.kafka.sender.KafkaSender;
import reactor.kafka.sender.SenderOptions;
import reactor.kafka.sender.SenderRecord;
import tools.jackson.databind.json.JsonMapper;

/**
 * Writes usage events to Kafka with reactor-kafka. Key = principal id, value = the event as JSON. The producer is
 * configured with short blocking and delivery timeouts so that a missing broker makes a batch fail in a few seconds
 * on the publisher's worker thread instead of hanging it; nothing here is ever called on a request thread.
 */
public class KafkaUsageSink implements UsageSink, AutoCloseable {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Duration BATCH_TIMEOUT = Duration.ofSeconds(10);

    private final KafkaSender<String, String> sender;
    private final String topic;

    public KafkaUsageSink(GatewayProperties.Metering metering) {
        Map<String, Object> config = new HashMap<>();
        config.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, metering.kafka().bootstrapServers());
        config.put(ProducerConfig.CLIENT_ID_CONFIG, "gateway-usage");
        config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        config.put(ProducerConfig.ACKS_CONFIG, "1");
        config.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, false); // consumers de-duplicate on eventId
        config.put(ProducerConfig.LINGER_MS_CONFIG, 5);
        config.put(ProducerConfig.MAX_BLOCK_MS_CONFIG, 1_000);
        config.put(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG, 2_000);
        config.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, 5_000);
        config.put(ProducerConfig.RECONNECT_BACKOFF_MS_CONFIG, 500);
        config.put(ProducerConfig.RECONNECT_BACKOFF_MAX_MS_CONFIG, 5_000);
        this.topic = metering.topic();
        this.sender = KafkaSender.create(SenderOptions.<String, String>create(config).closeTimeout(Duration.ofSeconds(2)));
    }

    @Override
    public int send(List<UsageEvent> batch) {
        AtomicInteger delivered = new AtomicInteger();
        try {
            sender.send(Flux.fromIterable(batch).map(e -> SenderRecord.create(
                            new ProducerRecord<>(topic, e.principalId(), JSON.writeValueAsString(e)), e.eventId())))
                    .doOnNext(result -> {
                        if (result.exception() == null) {
                            delivered.incrementAndGet();
                        }
                    })
                    .blockLast(BATCH_TIMEOUT);
        } catch (RuntimeException e) {
            // timeout or producer failure: whatever was not acknowledged is lost
        }
        return batch.size() - delivered.get();
    }

    @Override
    public void close() {
        sender.close();
    }
}
