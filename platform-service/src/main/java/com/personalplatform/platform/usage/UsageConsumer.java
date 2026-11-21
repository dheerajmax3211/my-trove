package com.personalplatform.platform.usage;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

/**
 * Stores every usage event exactly once in effect: the offset is committed only after the insert has committed
 * (manual ack), a redelivered event is ignored by {@code ON CONFLICT DO NOTHING}, and an event that can never be
 * stored goes to the dead-letter topic instead of blocking the partition.
 *
 * <ul>
 *   <li>malformed payload or a row the database rejects (constraint violation): parked on the DLQ with the reason in
 *       a header, then acknowledged, so consumption continues;</li>
 *   <li>any other failure (database down, DLQ unreachable): the exception goes to the container's error handler, which
 *       re-seeks to the same record and retries with backoff without ever committing past it.</li>
 * </ul>
 */
@Component
class UsageConsumer {

    private static final Logger log = LoggerFactory.getLogger(UsageConsumer.class);

    private final UsageEventParser parser;
    private final UsageRepository repository;
    private final KafkaTemplate<String, String> kafka;
    private final UsageProperties props;
    private final Counter stored;
    private final Counter duplicates;
    private final Counter deadLettered;

    UsageConsumer(UsageEventParser parser, UsageRepository repository, KafkaTemplate<String, String> kafka,
                  UsageProperties props, MeterRegistry meters) {
        this.parser = parser;
        this.repository = repository;
        this.kafka = kafka;
        this.props = props;
        this.stored = meters.counter("platform.usage.consumed", "outcome", "stored");
        this.duplicates = meters.counter("platform.usage.consumed", "outcome", "duplicate");
        this.deadLettered = meters.counter("platform.usage.consumed", "outcome", "dead_lettered");
    }

    @KafkaListener(id = "usage-consumer", idIsGroup = false, groupId = "${spring.kafka.consumer.group-id}",
            topics = "${app.usage.topic:platform.usage.v1}")
    void onRecord(ConsumerRecord<String, String> record, Acknowledgment ack) {
        try {
            UsageEvent event = parser.parse(record.value());
            if (repository.insertIdempotent(event)) {
                stored.increment();
            } else {
                duplicates.increment();
            }
        } catch (InvalidUsageEventException e) {
            deadLetter(record, e.getMessage());
        } catch (DataIntegrityViolationException e) {
            deadLetter(record, "rejected by the database: " + e.getMostSpecificCause().getMessage());
        }
        ack.acknowledge();   // only reached once the row is stored or parked on the DLQ
    }

    /** Synchronous on purpose: the offset must not be committed unless the DLQ record is durable. */
    private void deadLetter(ConsumerRecord<String, String> record, String reason) {
        ProducerRecord<String, String> dlq = new ProducerRecord<>(props.dlqTopic(), record.key(), record.value());
        dlq.headers().add("x-error-reason", reason.getBytes(StandardCharsets.UTF_8));
        dlq.headers().add("x-original-topic", record.topic().getBytes(StandardCharsets.UTF_8));
        dlq.headers().add("x-original-partition", Integer.toString(record.partition()).getBytes(StandardCharsets.UTF_8));
        dlq.headers().add("x-original-offset", Long.toString(record.offset()).getBytes(StandardCharsets.UTF_8));
        try {
            kafka.send(dlq).get(10, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("interrupted while writing to the dead-letter topic", e);
        } catch (ExecutionException | TimeoutException e) {
            throw new IllegalStateException("could not write to the dead-letter topic " + props.dlqTopic(), e);
        }
        deadLettered.increment();
        log.warn("usage event {}-{}@{} dead-lettered: {}", record.topic(), record.partition(), record.offset(), reason);
    }
}
