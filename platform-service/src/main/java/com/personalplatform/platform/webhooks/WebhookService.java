package com.personalplatform.platform.webhooks;

import com.personalplatform.platform.developer.DeveloperAppRepository;
import com.personalplatform.platform.developer.RedirectUris;
import com.personalplatform.platform.web.BadRequestException;
import com.personalplatform.platform.webhooks.WebhookDtos.Created;
import com.personalplatform.platform.webhooks.WebhookDtos.CreateRequest;
import com.personalplatform.platform.webhooks.WebhookDtos.DeliveryView;
import com.personalplatform.platform.webhooks.WebhookDtos.EndpointView;
import com.personalplatform.platform.webhooks.WebhookDtos.SecretRotated;
import com.personalplatform.platform.webhooks.WebhookRepository.Delivery;
import com.personalplatform.platform.webhooks.WebhookRepository.Endpoint;
import com.personalplatform.sql.UuidV7;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Webhook endpoints for the owner's apps, their signing secrets, their delivery log and replay, and the fan-out of domain
 * events to the owner's subscribed endpoints. Every developer-facing operation is owner-scoped (others get 404).
 */
@Service
class WebhookService {

    static final String DEFAULT_PLAN = "FREE";
    static final int DEFAULT_PLAN_LIMIT = 1;
    static final int LOG_LIMIT = 100;

    private final WebhookRepository repository;
    private final DeveloperAppRepository apps;
    private final Clock clock;

    WebhookService(WebhookRepository repository, DeveloperAppRepository apps, Clock clock) {
        this.repository = repository;
        this.apps = apps;
        this.clock = clock;
    }

    @Transactional
    Created create(String owner, String plan, UUID appId, CreateRequest request) {
        DeveloperAppRepository.Row app = apps.findOwned(owner, appId).orElseThrow(() -> notFound("developer app", appId));
        if (app.revokedAt() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This app is revoked");
        }
        List<String> url = RedirectUris.validate(List.of(request.url()));
        if (url.isEmpty()) {
            throw new BadRequestException("url is required");
        }
        List<String> types = eventTypes(request.eventTypes());
        enforcePlanLimit(owner, plan);

        UUID id = UuidV7.next();
        String secret = WebhookSignature.newSecret();
        String description = request.description() == null ? "" : request.description().strip();
        OffsetDateTime now = now();
        repository.insertEndpoint(id, appId, owner, url.get(0), description, secret, types, now);
        return new Created(id, appId, url.get(0), description, types, secret, now);
    }

    List<EndpointView> list(String owner, UUID appId) {
        apps.findOwned(owner, appId).orElseThrow(() -> notFound("developer app", appId));
        return repository.findByApp(appId).stream().map(WebhookService::view).toList();
    }

    @Transactional
    SecretRotated rotate(String owner, UUID id) {
        Endpoint endpoint = owned(owner, id);
        if (endpoint.disabledAt() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This endpoint is disabled");
        }
        String secret = WebhookSignature.newSecret();
        OffsetDateTime now = now();
        repository.setSecret(endpoint.id(), secret, now);
        return new SecretRotated(endpoint.id(), secret, now);
    }

    /** Stops deliveries to the endpoint. Its log stays readable. Idempotent. */
    @Transactional
    void disable(String owner, UUID id) {
        Endpoint endpoint = owned(owner, id);
        repository.disable(endpoint.id(), now());
    }

    List<DeliveryView> deliveries(String owner, UUID id) {
        Endpoint endpoint = owned(owner, id);
        return repository.findDeliveries(endpoint.id(), LOG_LIMIT).stream().map(WebhookService::view).toList();
    }

    /** A new delivery of the same event, pointing at the original. The original stays as it was. */
    @Transactional
    DeliveryView replay(String owner, UUID endpointId, UUID deliveryId) {
        Endpoint endpoint = owned(owner, endpointId);
        Delivery original = repository.findDelivery(deliveryId)
                .filter(d -> d.endpointId().equals(endpoint.id()))
                .orElseThrow(() -> notFound("delivery", deliveryId));
        if (endpoint.disabledAt() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This endpoint is disabled");
        }
        UUID id = UuidV7.next();
        OffsetDateTime now = now();
        repository.insertDelivery(id, endpoint.id(), original.eventId(), original.eventType(), original.payload(),
                "PENDING", 0, now, original.id(), now);
        return repository.findDelivery(id).map(WebhookService::view).orElseThrow();
    }

    /**
     * Fans one domain event out to the owner's active endpoints subscribed to its type. Idempotent per (endpoint, event):
     * a redelivered Kafka record adds nothing. Returns the number of deliveries created.
     */
    @Transactional
    int enqueue(DomainEvent event) {
        OffsetDateTime now = now();
        int created = 0;
        for (Endpoint endpoint : repository.findSubscribed(event.ownerUid(), event.type())) {
            if (repository.recordReceived(endpoint.id(), event.eventId(), now)) {
                repository.insertDelivery(UuidV7.next(), endpoint.id(), event.eventId(), event.type(), event.json(),
                        "PENDING", 0, now, null, now);
                created++;
            }
        }
        return created;
    }

    static List<WebhookDtos.EventView> catalogue() {
        return WebhookEvents.CATALOGUE.stream().map(e -> new WebhookDtos.EventView(e.name(), e.description())).toList();
    }

    private Endpoint owned(String owner, UUID id) {
        return repository.findOwned(owner, id).orElseThrow(() -> notFound("webhook endpoint", id));
    }

    private List<String> eventTypes(List<String> requested) {
        LinkedHashSet<String> distinct = new LinkedHashSet<>();
        for (String type : requested) {
            if (!WebhookEvents.TYPES.contains(type)) {
                throw new BadRequestException("unknown event type '" + type + "'");
            }
            distinct.add(type);
        }
        if (distinct.isEmpty()) {
            throw new BadRequestException("at least one event type is required");
        }
        return List.copyOf(distinct);
    }

    private void enforcePlanLimit(String owner, String plan) {
        String effectivePlan = plan == null || plan.isBlank() ? DEFAULT_PLAN : plan;
        int limit = repository.maxWebhooks(effectivePlan)
                .orElseGet(() -> repository.maxWebhooks(DEFAULT_PLAN).orElse(DEFAULT_PLAN_LIMIT));
        if (repository.countActive(owner) >= limit) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Your " + effectivePlan + " plan allows " + limit
                    + " active webhook endpoints; disable one first");
        }
    }

    private OffsetDateTime now() {
        return clock.instant().atOffset(ZoneOffset.UTC);
    }

    private static ResponseStatusException notFound(String what, UUID id) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "No " + what + " with id " + id);
    }

    static EndpointView view(Endpoint e) {
        return new EndpointView(e.id(), e.appId(), e.url(), e.description(), e.eventTypes(), e.createdAt(), e.disabledAt());
    }

    static DeliveryView view(Delivery d) {
        return new DeliveryView(d.id(), d.endpointId(), d.eventId(), d.eventType(), d.status(), d.attempts(), d.nextAttemptAt(),
                d.lastStatusCode(), d.lastError(), d.createdAt(), d.deliveredAt(), d.replayOf());
    }
}
