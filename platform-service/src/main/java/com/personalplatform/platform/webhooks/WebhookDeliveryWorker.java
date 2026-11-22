package com.personalplatform.platform.webhooks;

import com.personalplatform.platform.webhooks.WebhookRepository.Delivery;
import com.personalplatform.platform.webhooks.WebhookRepository.Endpoint;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Sends due deliveries. A claimed delivery is leased (its next attempt moves out by {@link #LEASE}) before the request is
 * sent, so a crashed worker leaves it to be retried later rather than losing it. A 2xx answer marks it delivered; any other
 * answer or a transport error schedules the retry from {@link RetryPolicy}, or dead-letters it after the last attempt.
 */
@Component
public class WebhookDeliveryWorker {

    static final int BATCH = 50;
    static final Duration LEASE = Duration.ofMinutes(5);

    private final WebhookRepository repository;
    private final WebhookSender sender;
    private final WebhookProperties props;
    private final Clock clock;

    WebhookDeliveryWorker(WebhookRepository repository, WebhookSender sender, WebhookProperties props, Clock clock) {
        this.repository = repository;
        this.sender = sender;
        this.props = props;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${app.webhooks.worker-interval:PT2S}")
    void tick() {
        if (props.workerEnabled()) {
            deliverDue();
        }
    }

    /** One pass over the due deliveries. Returns how many were attempted. */
    public int deliverDue() {
        OffsetDateTime now = clock.instant().atOffset(ZoneOffset.UTC);
        List<Delivery> due = repository.claimDue(now, now.plus(LEASE), BATCH);
        for (Delivery delivery : due) {
            attempt(delivery, now);
        }
        return due.size();
    }

    private void attempt(Delivery delivery, OffsetDateTime now) {
        Optional<Endpoint> endpoint = repository.findById(delivery.endpointId());
        if (endpoint.isEmpty() || endpoint.get().disabledAt() != null) {
            repository.markDead(delivery.id(), delivery.attempts(), null, "endpoint disabled");
            return;
        }
        long timestamp = now.toEpochSecond();
        String body = delivery.payload();
        Map<String, String> headers = Map.of(
                "Content-Type", "application/json",
                "User-Agent", "My-Trove-Webhooks/1",
                "X-Trove-Event-Id", delivery.eventId().toString(),
                "X-Trove-Event-Type", delivery.eventType(),
                "X-Trove-Delivery-Id", delivery.id().toString(),
                "X-Trove-Timestamp", Long.toString(timestamp),
                WebhookSignature.HEADER, WebhookSignature.sign(endpoint.get().secret(), timestamp, body));

        WebhookSender.Outcome outcome = sender.send(endpoint.get().url(), headers, body);
        int attempts = delivery.attempts() + 1;
        Integer statusCode = outcome.statusCode() == 0 ? null : outcome.statusCode();
        if (outcome.delivered()) {
            repository.markDelivered(delivery.id(), attempts, outcome.statusCode(), now);
            return;
        }
        String error = outcome.error() != null ? outcome.error() : "HTTP " + outcome.statusCode();
        Optional<Duration> wait = RetryPolicy.afterFailure(attempts);
        if (wait.isPresent()) {
            repository.markRetry(delivery.id(), attempts, statusCode, error, now.plus(wait.get()));
        } else {
            repository.markDead(delivery.id(), attempts, statusCode, error);
        }
    }
}
