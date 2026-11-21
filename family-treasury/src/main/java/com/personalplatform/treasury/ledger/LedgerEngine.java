package com.personalplatform.treasury.ledger;

import static com.personalplatform.sql.jooq.treasury.treasury.Tables.ACCOUNTS;
import static com.personalplatform.sql.jooq.treasury.treasury.Tables.ACCOUNT_BALANCES;
import static com.personalplatform.sql.jooq.treasury.treasury.Tables.JOURNAL_ENTRIES;
import static com.personalplatform.sql.jooq.treasury.treasury.Tables.POSTINGS;

import com.personalplatform.sql.UuidV7;
import com.personalplatform.treasury.household.AccountType;
import com.personalplatform.treasury.ledger.EntryView.PostingView;
import com.personalplatform.treasury.web.ApiException;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jooq.DSLContext;
import org.jooq.Record5;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * The only writer of journal entries, postings and the balance projection.
 *
 * <p>Concurrency: every posting locks the projection rows of ALL accounts it touches with a single
 * {@code SELECT ... ORDER BY account_id FOR UPDATE} (deterministic order, so two entries touching the same accounts in
 * opposite directions cannot deadlock). The balance is read AFTER the lock is held, so the overdraft check sees every
 * committed predecessor and N parallel spends can never jointly overdraw a non-negative account. The overdraft check
 * runs before any write, so a rejection leaves the transaction clean (callers may catch it and continue).
 * The database repeats the key invariants (balanced entries, append-only, balance side) as a backstop.
 */
@Component
public class LedgerEngine {

    /** One side of an entry: signed amount in minor units (positive = debit, negative = credit). */
    public record Line(UUID accountId, long amount) {}

    private final DSLContext dsl;
    private final Clock clock;

    public LedgerEngine(DSLContext dsl, Clock clock) {
        this.dsl = dsl;
        this.clock = clock;
    }

    /**
     * Deliberately NOT annotated {@code @Transactional}: a business rejection (overdraft) thrown through a transactional
     * proxy would mark the caller's transaction rollback-only, and the allowance runner needs to catch it and carry on.
     * It must still run inside the caller's transaction; that is asserted.
     */
    public EntryView post(UUID householdId, String idempotencyKey, EntryKind kind, String description, UUID reversesEntryId,
                          UUID approvalId, String actorUid, List<Line> lines) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("LedgerEngine.post must run inside a transaction");
        }
        if (lines.size() < 2) {
            throw new IllegalStateException("an entry needs at least 2 lines");
        }
        Map<UUID, Long> delta = new LinkedHashMap<>();
        for (Line l : lines) {
            if (l.amount() == 0) {
                throw new IllegalStateException("zero-amount line");
            }
            delta.merge(l.accountId(), l.amount(), Math::addExact);
        }

        // 1. lock projection rows in deterministic (database) order and read the fresh balances
        List<Record5<UUID, String, String, Boolean, Long>> locked = dsl
                .select(ACCOUNT_BALANCES.ACCOUNT_ID, ACCOUNTS.TYPE, ACCOUNTS.CURRENCY, ACCOUNTS.ALLOW_NEGATIVE, ACCOUNT_BALANCES.BALANCE)
                .from(ACCOUNT_BALANCES)
                .join(ACCOUNTS).on(ACCOUNTS.ID.eq(ACCOUNT_BALANCES.ACCOUNT_ID))
                .where(ACCOUNT_BALANCES.HOUSEHOLD_ID.eq(householdId).and(ACCOUNT_BALANCES.ACCOUNT_ID.in(delta.keySet())))
                .orderBy(ACCOUNT_BALANCES.ACCOUNT_ID)
                .forUpdate().of(ACCOUNT_BALANCES)
                .fetch();
        if (locked.size() != delta.size()) {
            throw ApiException.notFound("account");
        }

        // 2. validate: per-currency zero sum and overdraft rule (nothing has been written yet)
        Map<String, Long> perCurrency = new HashMap<>();
        Map<UUID, String> currencyOf = new HashMap<>();
        Map<UUID, Long> newBalance = new HashMap<>();
        for (var r : locked) {
            UUID id = r.value1();
            AccountType type = AccountType.valueOf(r.value2());
            String currency = r.value3();
            currencyOf.put(id, currency);
            perCurrency.merge(currency, delta.get(id), Math::addExact);
            long updated = Math.addExact(r.value5(), delta.get(id));
            newBalance.put(id, updated);
            boolean wrongSide = type.debitNormal() ? updated < 0 : updated > 0;
            if (wrongSide && !r.value4()) {
                throw ApiException.unprocessable("INSUFFICIENT_FUNDS",
                        "account would be overdrawn (available " + type.natural(r.value5()) + " minor units)");
            }
        }
        perCurrency.forEach((c, sum) -> {
            if (sum != 0) {
                throw new IllegalStateException("unbalanced entry in " + c + ": " + sum);
            }
        });

        // 3. write entry, postings and projection in this same transaction
        UUID entryId = UuidV7.next();
        OffsetDateTime now = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
        dsl.insertInto(JOURNAL_ENTRIES)
                .set(JOURNAL_ENTRIES.ID, entryId).set(JOURNAL_ENTRIES.HOUSEHOLD_ID, householdId)
                .set(JOURNAL_ENTRIES.IDEMPOTENCY_KEY, idempotencyKey).set(JOURNAL_ENTRIES.KIND, kind.name())
                .set(JOURNAL_ENTRIES.DESCRIPTION, description).set(JOURNAL_ENTRIES.LINE_COUNT, lines.size())
                .set(JOURNAL_ENTRIES.POSTED_AT, now).set(JOURNAL_ENTRIES.REVERSES_ENTRY_ID, reversesEntryId)
                .set(JOURNAL_ENTRIES.APPROVAL_ID, approvalId).set(JOURNAL_ENTRIES.CREATED_BY_UID, actorUid)
                .execute();
        var insert = dsl.insertInto(POSTINGS, POSTINGS.ID, POSTINGS.ENTRY_ID, POSTINGS.HOUSEHOLD_ID, POSTINGS.ACCOUNT_ID,
                POSTINGS.AMOUNT, POSTINGS.CURRENCY);
        List<PostingView> views = new ArrayList<>();
        for (Line l : lines) {
            String currency = currencyOf.get(l.accountId());
            insert = insert.values(UuidV7.next(), entryId, householdId, l.accountId(), l.amount(), currency);
            views.add(new PostingView(l.accountId(), l.amount(), currency));
        }
        insert.execute();
        for (var e : newBalance.entrySet()) {
            dsl.update(ACCOUNT_BALANCES)
                    .set(ACCOUNT_BALANCES.BALANCE, e.getValue())
                    .set(ACCOUNT_BALANCES.VERSION, ACCOUNT_BALANCES.VERSION.plus(1))
                    .set(ACCOUNT_BALANCES.UPDATED_AT, now)
                    .where(ACCOUNT_BALANCES.ACCOUNT_ID.eq(e.getKey()))
                    .execute();
        }
        return new EntryView(entryId, householdId, kind, description, now.toInstant(), reversesEntryId, approvalId, actorUid, views);
    }

    @Transactional(readOnly = true)
    public EntryView get(UUID householdId, UUID entryId) {
        var e = dsl.select(JOURNAL_ENTRIES.fields()).from(JOURNAL_ENTRIES)
                .where(JOURNAL_ENTRIES.ID.eq(entryId).and(JOURNAL_ENTRIES.HOUSEHOLD_ID.eq(householdId))).fetchOne();
        if (e == null) {
            throw ApiException.notFound("entry");
        }
        List<PostingView> postings = dsl.select(POSTINGS.ACCOUNT_ID, POSTINGS.AMOUNT, POSTINGS.CURRENCY).from(POSTINGS)
                .where(POSTINGS.ENTRY_ID.eq(entryId)).orderBy(POSTINGS.SEQ)
                .fetch(r -> new PostingView(r.value1(), r.value2(), r.value3()));
        return new EntryView(entryId, householdId, EntryKind.valueOf(e.get(JOURNAL_ENTRIES.KIND)),
                e.get(JOURNAL_ENTRIES.DESCRIPTION), e.get(JOURNAL_ENTRIES.POSTED_AT).toInstant(),
                e.get(JOURNAL_ENTRIES.REVERSES_ENTRY_ID), e.get(JOURNAL_ENTRIES.APPROVAL_ID),
                e.get(JOURNAL_ENTRIES.CREATED_BY_UID), postings);
    }

    /** Locks the entry row (used to serialise concurrent reversals of the same entry). */
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockEntry(UUID householdId, UUID entryId) {
        dsl.select(JOURNAL_ENTRIES.ID).from(JOURNAL_ENTRIES)
                .where(JOURNAL_ENTRIES.ID.eq(entryId).and(JOURNAL_ENTRIES.HOUSEHOLD_ID.eq(householdId))).forUpdate().fetch();
    }

    @Transactional(readOnly = true)
    public UUID reversalOf(UUID entryId) {
        return dsl.select(JOURNAL_ENTRIES.ID).from(JOURNAL_ENTRIES)
                .where(JOURNAL_ENTRIES.REVERSES_ENTRY_ID.eq(entryId)).fetchOne(JOURNAL_ENTRIES.ID);
    }

    @Transactional(readOnly = true)
    public List<EntryView> list(UUID householdId, int page, int size) {
        List<UUID> ids = dsl.select(JOURNAL_ENTRIES.ID).from(JOURNAL_ENTRIES)
                .where(JOURNAL_ENTRIES.HOUSEHOLD_ID.eq(householdId))
                .orderBy(JOURNAL_ENTRIES.POSTED_AT.desc(), JOURNAL_ENTRIES.ID.desc())
                .limit(size).offset((long) page * size).fetch(JOURNAL_ENTRIES.ID);
        return ids.stream().map(id -> get(householdId, id)).toList();
    }
}
