package com.personalplatform.platform.webhooks;

import static com.personalplatform.sql.jooq.platform.platform.tables.Plans.PLANS;
import static com.personalplatform.sql.jooq.platform.platform.tables.WebhookDeliveries.WEBHOOK_DELIVERIES;
import static com.personalplatform.sql.jooq.platform.platform.tables.WebhookEndpointEvents.WEBHOOK_ENDPOINT_EVENTS;
import static com.personalplatform.sql.jooq.platform.platform.tables.WebhookEndpoints.WEBHOOK_ENDPOINTS;
import static com.personalplatform.sql.jooq.platform.platform.tables.WebhookReceivedEvents.WEBHOOK_RECEIVED_EVENTS;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.springframework.stereotype.Repository;

@Repository
class WebhookRepository {

    record Endpoint(UUID id, UUID appId, String ownerUid, String url, String description, String secret,
                    OffsetDateTime createdAt, OffsetDateTime disabledAt, List<String> eventTypes) {}

    record Delivery(UUID id, UUID endpointId, UUID eventId, String eventType, String payload, String status, int attempts,
                    OffsetDateTime nextAttemptAt, Integer lastStatusCode, String lastError, OffsetDateTime createdAt,
                    OffsetDateTime deliveredAt, UUID replayOf) {}

    private final DSLContext dsl;

    WebhookRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    // ----- endpoints

    void insertEndpoint(UUID id, UUID appId, String ownerUid, String url, String description, String secret,
                        List<String> eventTypes, OffsetDateTime now) {
        dsl.insertInto(WEBHOOK_ENDPOINTS)
                .set(WEBHOOK_ENDPOINTS.ID, id)
                .set(WEBHOOK_ENDPOINTS.APP_ID, appId)
                .set(WEBHOOK_ENDPOINTS.OWNER_UID, ownerUid)
                .set(WEBHOOK_ENDPOINTS.URL, url)
                .set(WEBHOOK_ENDPOINTS.DESCRIPTION, description)
                .set(WEBHOOK_ENDPOINTS.SECRET, secret)
                .set(WEBHOOK_ENDPOINTS.CREATED_AT, now)
                .set(WEBHOOK_ENDPOINTS.UPDATED_AT, now)
                .execute();
        for (String type : eventTypes) {
            dsl.insertInto(WEBHOOK_ENDPOINT_EVENTS)
                    .set(WEBHOOK_ENDPOINT_EVENTS.ENDPOINT_ID, id)
                    .set(WEBHOOK_ENDPOINT_EVENTS.EVENT_TYPE, type)
                    .execute();
        }
    }

    Optional<Endpoint> findOwned(String ownerUid, UUID id) {
        return endpoints(WEBHOOK_ENDPOINTS.ID.eq(id).and(WEBHOOK_ENDPOINTS.OWNER_UID.eq(ownerUid))).stream().findFirst();
    }

    Optional<Endpoint> findById(UUID id) {
        return endpoints(WEBHOOK_ENDPOINTS.ID.eq(id)).stream().findFirst();
    }

    List<Endpoint> findByApp(UUID appId) {
        return endpoints(WEBHOOK_ENDPOINTS.APP_ID.eq(appId));
    }

    /** Active (not disabled) endpoints of this owner subscribed to this event type. */
    List<Endpoint> findSubscribed(String ownerUid, String eventType) {
        return endpoints(WEBHOOK_ENDPOINTS.OWNER_UID.eq(ownerUid)
                .and(WEBHOOK_ENDPOINTS.DISABLED_AT.isNull())
                .and(WEBHOOK_ENDPOINTS.ID.in(dsl.select(WEBHOOK_ENDPOINT_EVENTS.ENDPOINT_ID)
                        .from(WEBHOOK_ENDPOINT_EVENTS).where(WEBHOOK_ENDPOINT_EVENTS.EVENT_TYPE.eq(eventType)))));
    }

    int countActive(String ownerUid) {
        return dsl.selectCount().from(WEBHOOK_ENDPOINTS)
                .where(WEBHOOK_ENDPOINTS.OWNER_UID.eq(ownerUid), WEBHOOK_ENDPOINTS.DISABLED_AT.isNull())
                .fetchOne(0, int.class);
    }

    void setSecret(UUID id, String secret, OffsetDateTime now) {
        dsl.update(WEBHOOK_ENDPOINTS).set(WEBHOOK_ENDPOINTS.SECRET, secret).set(WEBHOOK_ENDPOINTS.UPDATED_AT, now)
                .where(WEBHOOK_ENDPOINTS.ID.eq(id)).execute();
    }

    void disable(UUID id, OffsetDateTime now) {
        dsl.update(WEBHOOK_ENDPOINTS).set(WEBHOOK_ENDPOINTS.DISABLED_AT, now).set(WEBHOOK_ENDPOINTS.UPDATED_AT, now)
                .where(WEBHOOK_ENDPOINTS.ID.eq(id), WEBHOOK_ENDPOINTS.DISABLED_AT.isNull()).execute();
    }

    Optional<Integer> maxWebhooks(String plan) {
        return dsl.select(PLANS.MAX_WEBHOOKS).from(PLANS).where(PLANS.NAME.eq(plan)).fetchOptional(PLANS.MAX_WEBHOOKS);
    }

    private List<Endpoint> endpoints(org.jooq.Condition condition) {
        List<Record> rows = new ArrayList<>(dsl.selectFrom(WEBHOOK_ENDPOINTS).where(condition)
                .orderBy(WEBHOOK_ENDPOINTS.CREATED_AT, WEBHOOK_ENDPOINTS.ID).fetch());
        if (rows.isEmpty()) {
            return List.of();
        }
        List<UUID> ids = rows.stream().map(r -> r.get(WEBHOOK_ENDPOINTS.ID)).toList();
        Map<UUID, List<String>> types = new HashMap<>();
        dsl.selectFrom(WEBHOOK_ENDPOINT_EVENTS).where(WEBHOOK_ENDPOINT_EVENTS.ENDPOINT_ID.in(ids))
                .orderBy(WEBHOOK_ENDPOINT_EVENTS.EVENT_TYPE).fetch()
                .forEach(t -> types.computeIfAbsent(t.get(WEBHOOK_ENDPOINT_EVENTS.ENDPOINT_ID), k -> new ArrayList<>())
                        .add(t.get(WEBHOOK_ENDPOINT_EVENTS.EVENT_TYPE)));
        return rows.stream().map(r -> new Endpoint(
                r.get(WEBHOOK_ENDPOINTS.ID),
                r.get(WEBHOOK_ENDPOINTS.APP_ID),
                r.get(WEBHOOK_ENDPOINTS.OWNER_UID),
                r.get(WEBHOOK_ENDPOINTS.URL),
                r.get(WEBHOOK_ENDPOINTS.DESCRIPTION),
                r.get(WEBHOOK_ENDPOINTS.SECRET),
                r.get(WEBHOOK_ENDPOINTS.CREATED_AT),
                r.get(WEBHOOK_ENDPOINTS.DISABLED_AT),
                types.getOrDefault(r.get(WEBHOOK_ENDPOINTS.ID), List.of()))).toList();
    }

    // ----- fan-out

    /** Records that this endpoint has been asked to deliver this event. False when it already had been. */
    boolean recordReceived(UUID endpointId, UUID eventId, OffsetDateTime now) {
        return dsl.insertInto(WEBHOOK_RECEIVED_EVENTS)
                .set(WEBHOOK_RECEIVED_EVENTS.ENDPOINT_ID, endpointId)
                .set(WEBHOOK_RECEIVED_EVENTS.EVENT_ID, eventId)
                .set(WEBHOOK_RECEIVED_EVENTS.RECEIVED_AT, now)
                .onConflictDoNothing()
                .execute() == 1;
    }

    void insertDelivery(UUID id, UUID endpointId, UUID eventId, String eventType, String payload, String status, int attempts,
                        OffsetDateTime nextAttemptAt, UUID replayOf, OffsetDateTime now) {
        dsl.insertInto(WEBHOOK_DELIVERIES)
                .set(WEBHOOK_DELIVERIES.ID, id)
                .set(WEBHOOK_DELIVERIES.ENDPOINT_ID, endpointId)
                .set(WEBHOOK_DELIVERIES.EVENT_ID, eventId)
                .set(WEBHOOK_DELIVERIES.EVENT_TYPE, eventType)
                .set(WEBHOOK_DELIVERIES.PAYLOAD, payload)
                .set(WEBHOOK_DELIVERIES.STATUS, status)
                .set(WEBHOOK_DELIVERIES.ATTEMPTS, attempts)
                .set(WEBHOOK_DELIVERIES.NEXT_ATTEMPT_AT, nextAttemptAt)
                .set(WEBHOOK_DELIVERIES.REPLAY_OF, replayOf)
                .set(WEBHOOK_DELIVERIES.CREATED_AT, now)
                .execute();
    }

    List<Delivery> findDeliveries(UUID endpointId, int limit) {
        return dsl.selectFrom(WEBHOOK_DELIVERIES).where(WEBHOOK_DELIVERIES.ENDPOINT_ID.eq(endpointId))
                .orderBy(WEBHOOK_DELIVERIES.CREATED_AT.desc(), WEBHOOK_DELIVERIES.ID.desc()).limit(limit).fetch()
                .map(WebhookRepository::delivery);
    }

    Optional<Delivery> findDelivery(UUID id) {
        return dsl.selectFrom(WEBHOOK_DELIVERIES).where(WEBHOOK_DELIVERIES.ID.eq(id)).fetchOptional().map(WebhookRepository::delivery);
    }

    /**
     * Takes up to {@code limit} due PENDING deliveries and pushes their next attempt to {@code leaseUntil}, in one
     * statement: a worker that dies mid-send leaves them to be retried once the lease passes.
     */
    List<Delivery> claimDue(OffsetDateTime now, OffsetDateTime leaseUntil, int limit) {
        return dsl.resultQuery("""
                update platform.webhook_deliveries set next_attempt_at = {0}
                where id in (select id from platform.webhook_deliveries
                             where status = 'PENDING' and next_attempt_at <= {1}
                             order by next_attempt_at limit {2} for update skip locked)
                returning id, endpoint_id, event_id, event_type, payload, status, attempts, next_attempt_at,
                          last_status_code, last_error, created_at, delivered_at, replay_of
                """, leaseUntil, now, limit).fetch().map(WebhookRepository::delivery);
    }

    void markDelivered(UUID id, int attempts, int statusCode, OffsetDateTime now) {
        dsl.update(WEBHOOK_DELIVERIES)
                .set(WEBHOOK_DELIVERIES.STATUS, "DELIVERED")
                .set(WEBHOOK_DELIVERIES.ATTEMPTS, attempts)
                .set(WEBHOOK_DELIVERIES.LAST_STATUS_CODE, statusCode)
                .set(WEBHOOK_DELIVERIES.LAST_ERROR, (String) null)
                .set(WEBHOOK_DELIVERIES.NEXT_ATTEMPT_AT, (OffsetDateTime) null)
                .set(WEBHOOK_DELIVERIES.DELIVERED_AT, now)
                .where(WEBHOOK_DELIVERIES.ID.eq(id))
                .execute();
    }

    void markRetry(UUID id, int attempts, Integer statusCode, String error, OffsetDateTime nextAttemptAt) {
        dsl.update(WEBHOOK_DELIVERIES)
                .set(WEBHOOK_DELIVERIES.ATTEMPTS, attempts)
                .set(WEBHOOK_DELIVERIES.LAST_STATUS_CODE, statusCode)
                .set(WEBHOOK_DELIVERIES.LAST_ERROR, error)
                .set(WEBHOOK_DELIVERIES.NEXT_ATTEMPT_AT, nextAttemptAt)
                .where(WEBHOOK_DELIVERIES.ID.eq(id))
                .execute();
    }

    void markDead(UUID id, int attempts, Integer statusCode, String error) {
        dsl.update(WEBHOOK_DELIVERIES)
                .set(WEBHOOK_DELIVERIES.STATUS, "DEAD")
                .set(WEBHOOK_DELIVERIES.ATTEMPTS, attempts)
                .set(WEBHOOK_DELIVERIES.LAST_STATUS_CODE, statusCode)
                .set(WEBHOOK_DELIVERIES.LAST_ERROR, error)
                .set(WEBHOOK_DELIVERIES.NEXT_ATTEMPT_AT, (OffsetDateTime) null)
                .where(WEBHOOK_DELIVERIES.ID.eq(id))
                .execute();
    }

    private static Delivery delivery(Record r) {
        return new Delivery(
                r.get("id", UUID.class),
                r.get("endpoint_id", UUID.class),
                r.get("event_id", UUID.class),
                r.get("event_type", String.class),
                r.get("payload", String.class),
                r.get("status", String.class),
                r.get("attempts", Integer.class),
                r.get("next_attempt_at", OffsetDateTime.class),
                r.get("last_status_code", Integer.class),
                r.get("last_error", String.class),
                r.get("created_at", OffsetDateTime.class),
                r.get("delivered_at", OffsetDateTime.class),
                r.get("replay_of", UUID.class));
    }
}
