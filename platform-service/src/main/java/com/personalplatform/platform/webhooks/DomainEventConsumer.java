package com.personalplatform.platform.webhooks;

import java.util.concurrent.TimeUnit;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Reads the domain topic and fans events out to webhook deliveries. The offset is committed only after the fan-out is in
 * the database, so a database outage delays events rather than losing them. An event that can never be read is copied to
 * the dead-letter topic and acknowledged.
 */
@Component
class DomainEventConsumer {

    private final WebhookService service;
    private final KafkaTemplate<String, String> kafka;
    private final WebhookProperties props;
    private final JsonMapper json;

    DomainEventConsumer(WebhookService service, KafkaTemplate<String, String> kafka, WebhookProperties props, JsonMapper json) {
        this.service = service;
        this.kafka = kafka;
        this.props = props;
        this.json = json;
    }

    @KafkaListener(id = "platform-domain-events", topics = "${app.webhooks.domain-topic:platform.domain.events.v1}",
            groupId = "platform-service-webhooks")
    void onEvent(ConsumerRecord<String, String> record, Acknowledgment ack) throws Exception {
        DomainEvent event;
        try {
            event = DomainEvent.parse(record.value(), json);
        } catch (DomainEvent.InvalidDomainEventException e) {
            kafka.send(props.domainDlqTopic(), record.key(), record.value()).get(10, TimeUnit.SECONDS);
            ack.acknowledge();
            return;
        }
        service.enqueue(event);
        ack.acknowledge();
    }
}
