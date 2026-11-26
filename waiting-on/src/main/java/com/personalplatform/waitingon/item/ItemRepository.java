package com.personalplatform.waitingon.item;

import static com.personalplatform.sql.jooq.waiting_on.waiting_on.Tables.ITEMS;

import com.personalplatform.sql.jooq.waiting_on.waiting_on.tables.records.ItemsRecord;
import com.personalplatform.waitingon.escalation.EscalationPlan;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jooq.Condition;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

/**
 * All user-facing lookups take the owner uid and put it in the WHERE clause, so a row of another user is simply
 * "not found". The few owner-less methods (by id / by reply token) exist for the workflow activities and the
 * inbound webhook, which act on behalf of the system and are not reachable with a user token.
 */
@Repository
public class ItemRepository {

    private final DSLContext dsl;

    public ItemRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    public void insert(WaitingItem i) {
        dsl.insertInto(ITEMS)
                .set(ITEMS.ID, i.id())
                .set(ITEMS.OWNER_UID, i.ownerUid())
                .set(ITEMS.TITLE, i.title())
                .set(ITEMS.COUNTERPARTY, i.counterparty())
                .set(ITEMS.COUNTERPARTY_EMAIL, i.counterpartyEmail())
                .set(ITEMS.CATEGORY, i.category().name())
                .set(ITEMS.AMOUNT, i.amount())
                .set(ITEMS.CURRENCY, i.currency())
                .set(ITEMS.EXPECTED_BY, i.expectedBy())
                .set(ITEMS.STATUS, i.status().name())
                .set(ITEMS.REPLY_TOKEN, i.replyToken())
                .set(ITEMS.WORKFLOW_ID, i.workflowId())
                .set(ITEMS.NUDGE_AFTER_DAYS, i.plan().nudgeAfterDays())
                .set(ITEMS.ESCALATE_AFTER_DAYS, i.plan().escalateAfterDays())
                .set(ITEMS.FINAL_NOTICE_AFTER_DAYS, i.plan().finalNoticeAfterDays())
                .set(ITEMS.EXPIRE_AFTER_DAYS, i.plan().expireAfterDays())
                .set(ITEMS.CREATED_AT, i.createdAt())
                .set(ITEMS.UPDATED_AT, i.updatedAt())
                .execute();
    }

    public Optional<WaitingItem> findByIdAndOwner(UUID id, String ownerUid) {
        return dsl.selectFrom(ITEMS).where(ITEMS.ID.eq(id).and(ITEMS.OWNER_UID.eq(ownerUid)))
                .fetchOptional(ItemRepository::map);
    }

    /** System use only (activities); never expose the result of this to a caller without an ownership check. */
    public Optional<WaitingItem> findById(UUID id) {
        return dsl.selectFrom(ITEMS).where(ITEMS.ID.eq(id)).fetchOptional(ItemRepository::map);
    }

    /** System use only (inbound webhook). */
    public Optional<WaitingItem> findByReplyToken(String token) {
        return dsl.selectFrom(ITEMS).where(ITEMS.REPLY_TOKEN.eq(token)).fetchOptional(ItemRepository::map);
    }

    /** System use only (follow-up reconciler): active items of every owner, in id order, one page after {@code afterId}. */
    public List<WaitingItem> listActive(UUID afterId, int limit) {
        Condition c = ITEMS.STATUS.in(ItemStatus.ACTIVE.stream().map(Enum::name).toList());
        if (afterId != null) {
            c = c.and(ITEMS.ID.gt(afterId));
        }
        return dsl.selectFrom(ITEMS).where(c).orderBy(ITEMS.ID.asc()).limit(limit).fetch(ItemRepository::map);
    }

    public List<WaitingItem> list(String ownerUid, Collection<ItemStatus> statuses, int limit, int offset) {
        Condition c = ITEMS.OWNER_UID.eq(ownerUid);
        if (statuses != null && !statuses.isEmpty()) {
            c = c.and(ITEMS.STATUS.in(statuses.stream().map(Enum::name).toList()));
        }
        return dsl.selectFrom(ITEMS).where(c)
                .orderBy(ITEMS.EXPECTED_BY.asc(), ITEMS.CREATED_AT.desc(), ITEMS.ID.desc())
                .limit(limit).offset(offset)
                .fetch(ItemRepository::map);
    }

    /**
     * Compare-and-set on status: moves the item to {@code to} only if it currently is one of {@code from}.
     * Returns false when nothing changed (already terminal, or in an unexpected state), which makes callers
     * idempotent.
     */
    public boolean transition(UUID id, Collection<ItemStatus> from, ItemStatus to, String outcome,
            OffsetDateTime now) {
        var update = dsl.update(ITEMS)
                .set(ITEMS.STATUS, to.name())
                .set(ITEMS.UPDATED_AT, now);
        if (to.isTerminal()) {
            update.set(ITEMS.OUTCOME, outcome).set(ITEMS.CLOSED_AT, now);
        }
        return update.where(ITEMS.ID.eq(id)
                        .and(ITEMS.STATUS.in(from.stream().map(Enum::name).toList())))
                .execute() == 1;
    }

    public void touch(UUID id, OffsetDateTime now) {
        dsl.update(ITEMS).set(ITEMS.UPDATED_AT, now).where(ITEMS.ID.eq(id)).execute();
    }

    private static WaitingItem map(ItemsRecord r) {
        return new WaitingItem(r.getId(), r.getOwnerUid(), r.getTitle(), r.getCounterparty(),
                r.getCounterpartyEmail(), ItemCategory.valueOf(r.getCategory()), r.getAmount(), r.getCurrency(),
                r.getExpectedBy(), ItemStatus.valueOf(r.getStatus()), r.getOutcome(), r.getReplyToken(),
                r.getWorkflowId(),
                new EscalationPlan(r.getNudgeAfterDays(), r.getEscalateAfterDays(), r.getFinalNoticeAfterDays(),
                        r.getExpireAfterDays()),
                r.getCreatedAt(), r.getUpdatedAt(), r.getClosedAt());
    }
}
