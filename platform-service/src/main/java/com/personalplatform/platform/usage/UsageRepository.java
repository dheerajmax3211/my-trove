package com.personalplatform.platform.usage;

import static com.personalplatform.sql.jooq.platform.platform.tables.UsageEvents.USAGE_EVENTS;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

@Repository
public class UsageRepository {

    private final DSLContext dsl;

    public UsageRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    /**
     * Inserts the event unless a row with the same {@code (event_id, ts)} exists, which makes Kafka's at-least-once
     * delivery harmless: a redelivered record carries the same eventId and ts and is ignored.
     *
     * @return true when a row was written, false when it was a duplicate
     */
    public boolean insertIdempotent(UsageEvent e) {
        return dsl.insertInto(USAGE_EVENTS)
                .set(USAGE_EVENTS.EVENT_ID, e.eventId())
                .set(USAGE_EVENTS.TS, OffsetDateTime.ofInstant(e.ts(), ZoneOffset.UTC))
                .set(USAGE_EVENTS.REQUEST_ID, e.requestId())
                .set(USAGE_EVENTS.PRINCIPAL_TYPE, e.principalType().name())
                .set(USAGE_EVENTS.PRINCIPAL_ID, e.principalId())
                .set(USAGE_EVENTS.APP_ID, e.appId())
                .set(USAGE_EVENTS.SERVICE, e.service())
                .set(USAGE_EVENTS.METHOD, e.method())
                .set(USAGE_EVENTS.ROUTE_TEMPLATE, e.routeTemplate())
                .set(USAGE_EVENTS.STATUS, (short) e.status())
                .set(USAGE_EVENTS.LATENCY_MS, e.latencyMs())
                .set(USAGE_EVENTS.REQUEST_BYTES, e.requestBytes())
                .set(USAGE_EVENTS.RESPONSE_BYTES, e.responseBytes())
                .set(USAGE_EVENTS.PLAN, e.plan())
                .set(USAGE_EVENTS.RATE_LIMITED, e.rateLimited())
                .onConflictDoNothing()
                .execute() == 1;
    }
}
