package com.personalplatform.waitingon.item;

import static com.personalplatform.sql.jooq.waiting_on.waiting_on.Tables.ITEM_EVENTS;

import com.personalplatform.sql.UuidV7;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

/** Append-only: there is deliberately no update or delete method (and the database refuses them too). */
@Repository
public class EventRepository {

    private final DSLContext dsl;

    public EventRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    /**
     * Appends an event. When {@code dedupeKey} is not null, a second append with the same (item, key) is ignored and
     * false is returned; this is what makes retried workflow activities and retried webhooks idempotent.
     */
    public boolean append(UUID itemId, String ownerUid, EventType type, String summary, String detail,
            String dedupeKey, OffsetDateTime at) {
        return dsl.insertInto(ITEM_EVENTS)
                .set(ITEM_EVENTS.ID, UuidV7.next())
                .set(ITEM_EVENTS.ITEM_ID, itemId)
                .set(ITEM_EVENTS.OWNER_UID, ownerUid)
                .set(ITEM_EVENTS.TYPE, type.name())
                .set(ITEM_EVENTS.SUMMARY, truncate(summary, 300))
                .set(ITEM_EVENTS.DETAIL, detail)
                .set(ITEM_EVENTS.DEDUPE_KEY, dedupeKey)
                .set(ITEM_EVENTS.OCCURRED_AT, at)
                .onConflict(ITEM_EVENTS.ITEM_ID, ITEM_EVENTS.DEDUPE_KEY)
                .doNothing()
                .execute() == 1;
    }

    /** Oldest first. Scoped by owner as well as item id (defence in depth: events carry the owner uid). */
    public List<TimelineEvent> timeline(UUID itemId, String ownerUid) {
        return dsl.selectFrom(ITEM_EVENTS)
                .where(ITEM_EVENTS.ITEM_ID.eq(itemId).and(ITEM_EVENTS.OWNER_UID.eq(ownerUid)))
                .orderBy(ITEM_EVENTS.SEQ.asc())
                .fetch(r -> new TimelineEvent(r.getId(), r.getItemId(), EventType.valueOf(r.getType()),
                        r.getSummary(), r.getDetail(), r.getOccurredAt()));
    }

    private static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
