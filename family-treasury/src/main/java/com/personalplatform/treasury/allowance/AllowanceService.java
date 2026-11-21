package com.personalplatform.treasury.allowance;

import static com.personalplatform.sql.jooq.treasury.treasury.Tables.ALLOWANCE_RUNS;
import static com.personalplatform.sql.jooq.treasury.treasury.Tables.ALLOWANCE_SCHEDULES;

import com.personalplatform.sql.UuidV7;
import com.personalplatform.treasury.allowance.AllowanceDtos.CreateScheduleRequest;
import com.personalplatform.treasury.allowance.AllowanceDtos.RunSummary;
import com.personalplatform.treasury.allowance.AllowanceDtos.ScheduleView;
import com.personalplatform.treasury.household.AccountType;
import com.personalplatform.treasury.household.HouseholdService;
import com.personalplatform.treasury.household.Role;
import com.personalplatform.treasury.household.Rows.AccountRow;
import com.personalplatform.treasury.ledger.EntryKind;
import com.personalplatform.treasury.ledger.EntryView;
import com.personalplatform.treasury.ledger.LedgerEngine;
import com.personalplatform.treasury.ledger.LedgerEngine.Line;
import com.personalplatform.treasury.web.ApiException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Weekly/monthly allowances paid from a household account into a member pot.
 *
 * <p>Exactly-once per (schedule, period): a runner claims one due schedule at a time with
 * {@code FOR UPDATE SKIP LOCKED} (concurrent runners skip a schedule somebody else is processing), records every period in
 * {@code allowance_runs} (primary key schedule+period, written with ON CONFLICT DO NOTHING) and posts the entry with the
 * deterministic idempotency key {@code allowance:<schedule>:<period>}. Three independent guards, so a double run pays once.
 *
 * <p>MISSED-PERIOD POLICY (documented, deliberate): if several periods are due (service was down, or a payment could
 * not be made), only the LATEST due period is paid; every earlier due period is recorded as SKIPPED and never paid
 * retroactively. A period that cannot be paid for lack of funds is recorded FAILED and is NOT retried. Periods are
 * evaluated against the injected clock in UTC.
 */
@Service
public class AllowanceService {

    private static final Logger log = LoggerFactory.getLogger(AllowanceService.class);

    private final DSLContext dsl;
    private final Clock clock;
    private final HouseholdService households;
    private final LedgerEngine ledger;
    private final TransactionTemplate tx;

    public AllowanceService(DSLContext dsl, Clock clock, HouseholdService households, LedgerEngine ledger, TransactionTemplate tx) {
        this.dsl = dsl;
        this.clock = clock;
        this.households = households;
        this.ledger = ledger;
        this.tx = tx;
    }

    private OffsetDateTime now() {
        return OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
    }

    private LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC);
    }

    private static ScheduleView toView(Record r) {
        return new ScheduleView(r.get(ALLOWANCE_SCHEDULES.ID), r.get(ALLOWANCE_SCHEDULES.FROM_ACCOUNT_ID),
                r.get(ALLOWANCE_SCHEDULES.TO_ACCOUNT_ID), r.get(ALLOWANCE_SCHEDULES.AMOUNT), r.get(ALLOWANCE_SCHEDULES.CURRENCY),
                Frequency.valueOf(r.get(ALLOWANCE_SCHEDULES.FREQUENCY)), r.get(ALLOWANCE_SCHEDULES.START_DATE),
                r.get(ALLOWANCE_SCHEDULES.NEXT_DUE_ON), r.get(ALLOWANCE_SCHEDULES.ACTIVE), r.get(ALLOWANCE_SCHEDULES.DESCRIPTION));
    }

    @Transactional
    public ScheduleView create(String uid, UUID householdId, CreateScheduleRequest req) {
        households.requireRole(householdId, uid, Role.OWNER);
        AccountRow from = req.fromAccountId() == null
                ? households.accountByCode(householdId, HouseholdService.POOL)
                : households.account(householdId, req.fromAccountId());
        AccountRow to = households.account(householdId, req.toAccountId());
        if (from.type() != AccountType.ASSET || to.type() != AccountType.ASSET || to.ownerUid() == null
                || !from.currency().equals(to.currency()) || from.id().equals(to.id())) {
            throw ApiException.unprocessable("INVALID_SCHEDULE",
                    "an allowance moves money between two different asset accounts of one currency, into a member pot");
        }
        if (req.startDate().isBefore(today())) {
            throw ApiException.badRequest("START_IN_PAST", "startDate must not be in the past (missed periods are never back-paid)");
        }
        UUID id = UuidV7.next();
        dsl.insertInto(ALLOWANCE_SCHEDULES)
                .set(ALLOWANCE_SCHEDULES.ID, id).set(ALLOWANCE_SCHEDULES.HOUSEHOLD_ID, householdId)
                .set(ALLOWANCE_SCHEDULES.FROM_ACCOUNT_ID, from.id()).set(ALLOWANCE_SCHEDULES.TO_ACCOUNT_ID, to.id())
                .set(ALLOWANCE_SCHEDULES.AMOUNT, req.amountMinor()).set(ALLOWANCE_SCHEDULES.CURRENCY, from.currency())
                .set(ALLOWANCE_SCHEDULES.FREQUENCY, req.frequency().name()).set(ALLOWANCE_SCHEDULES.START_DATE, req.startDate())
                .set(ALLOWANCE_SCHEDULES.NEXT_DUE_ON, req.startDate()).set(ALLOWANCE_SCHEDULES.ACTIVE, true)
                .set(ALLOWANCE_SCHEDULES.DESCRIPTION, req.description()).set(ALLOWANCE_SCHEDULES.CREATED_BY_UID, uid)
                .set(ALLOWANCE_SCHEDULES.CREATED_AT, now())
                .execute();
        return toView(dsl.select(ALLOWANCE_SCHEDULES.fields()).from(ALLOWANCE_SCHEDULES).where(ALLOWANCE_SCHEDULES.ID.eq(id)).fetchOne());
    }

    @Transactional(readOnly = true)
    public List<ScheduleView> list(String uid, UUID householdId) {
        households.requireRole(householdId, uid, Role.OWNER, Role.APPROVER);
        return dsl.select(ALLOWANCE_SCHEDULES.fields()).from(ALLOWANCE_SCHEDULES)
                .where(ALLOWANCE_SCHEDULES.HOUSEHOLD_ID.eq(householdId)).orderBy(ALLOWANCE_SCHEDULES.CREATED_AT, ALLOWANCE_SCHEDULES.ID)
                .fetch(AllowanceService::toView);
    }

    @Transactional
    public void deactivate(String uid, UUID householdId, UUID scheduleId) {
        households.requireRole(householdId, uid, Role.OWNER);
        int n = dsl.update(ALLOWANCE_SCHEDULES).set(ALLOWANCE_SCHEDULES.ACTIVE, false)
                .where(ALLOWANCE_SCHEDULES.ID.eq(scheduleId).and(ALLOWANCE_SCHEDULES.HOUSEHOLD_ID.eq(householdId))).execute();
        if (n == 0) {
            throw ApiException.notFound("schedule");
        }
    }

    @Transactional(readOnly = true)
    public List<String> runLog(String uid, UUID householdId, UUID scheduleId) {
        households.requireRole(householdId, uid, Role.OWNER, Role.APPROVER);
        return dsl.select(ALLOWANCE_RUNS.PERIOD_START, ALLOWANCE_RUNS.STATUS).from(ALLOWANCE_RUNS)
                .join(ALLOWANCE_SCHEDULES).on(ALLOWANCE_SCHEDULES.ID.eq(ALLOWANCE_RUNS.SCHEDULE_ID))
                .where(ALLOWANCE_RUNS.SCHEDULE_ID.eq(scheduleId).and(ALLOWANCE_SCHEDULES.HOUSEHOLD_ID.eq(householdId)))
                .orderBy(ALLOWANCE_RUNS.PERIOD_START)
                .fetch(r -> r.value1() + " " + r.value2());
    }

    /** Pays everything that is due right now. Safe to call concurrently and repeatedly. */
    public RunSummary runDue() {
        int[] counts = new int[3];
        while (true) {
            Boolean processed;
            try {
                processed = tx.execute(status -> processOneDue(counts));
            } catch (RuntimeException e) {
                log.error("allowance run aborted", e);
                break;
            }
            if (!Boolean.TRUE.equals(processed)) {
                break;
            }
        }
        return new RunSummary(counts[0], counts[1], counts[2]);
    }

    private boolean processOneDue(int[] counts) {
        LocalDate today = today();
        Record s = dsl.select(ALLOWANCE_SCHEDULES.fields()).from(ALLOWANCE_SCHEDULES)
                .where(ALLOWANCE_SCHEDULES.ACTIVE.isTrue().and(ALLOWANCE_SCHEDULES.NEXT_DUE_ON.le(today)))
                .orderBy(ALLOWANCE_SCHEDULES.NEXT_DUE_ON, ALLOWANCE_SCHEDULES.ID)
                .limit(1)
                .forUpdate().skipLocked()
                .fetchOne();
        if (s == null) {
            return false;
        }
        UUID id = s.get(ALLOWANCE_SCHEDULES.ID);
        UUID householdId = s.get(ALLOWANCE_SCHEDULES.HOUSEHOLD_ID);
        Frequency freq = Frequency.valueOf(s.get(ALLOWANCE_SCHEDULES.FREQUENCY));
        LocalDate anchor = s.get(ALLOWANCE_SCHEDULES.START_DATE);
        long nextIndex = freq.latestIndexOnOrBefore(anchor, s.get(ALLOWANCE_SCHEDULES.NEXT_DUE_ON));
        long latestIndex = freq.latestIndexOnOrBefore(anchor, today);

        for (long k = nextIndex; k < latestIndex; k++) {
            if (recordRun(id, freq.periodStart(anchor, k), "SKIPPED", null, "missed period (policy: only the latest due period is paid)")) {
                counts[1]++;
            }
        }
        LocalDate period = freq.periodStart(anchor, latestIndex);
        String createdBy = s.get(ALLOWANCE_SCHEDULES.CREATED_BY_UID);
        long amount = s.get(ALLOWANCE_SCHEDULES.AMOUNT);
        // Claim the period first: a second runner (or a replay) finds the row and pays nothing.
        if (claim(id, period)) {
            try {
                EntryView e = ledger.post(householdId, "allowance:" + id + ":" + period, EntryKind.ALLOWANCE,
                        s.get(ALLOWANCE_SCHEDULES.DESCRIPTION) + " (" + period + ")", null, null, createdBy,
                        List.of(new Line(s.get(ALLOWANCE_SCHEDULES.FROM_ACCOUNT_ID), -amount),
                                new Line(s.get(ALLOWANCE_SCHEDULES.TO_ACCOUNT_ID), amount)));
                dsl.update(ALLOWANCE_RUNS).set(ALLOWANCE_RUNS.STATUS, "PAID").set(ALLOWANCE_RUNS.ENTRY_ID, e.id())
                        .where(ALLOWANCE_RUNS.SCHEDULE_ID.eq(id).and(ALLOWANCE_RUNS.PERIOD_START.eq(period))).execute();
                counts[0]++;
            } catch (ApiException e) {
                log.warn("allowance {} period {} not paid: {}", id, period, e.getMessage());
                // nothing was written by the ledger before it rejected the entry, so the transaction is still clean
                dsl.update(ALLOWANCE_RUNS).set(ALLOWANCE_RUNS.STATUS, "FAILED").set(ALLOWANCE_RUNS.REASON, e.getMessage())
                        .where(ALLOWANCE_RUNS.SCHEDULE_ID.eq(id).and(ALLOWANCE_RUNS.PERIOD_START.eq(period))).execute();
                counts[2]++;
            }
        }
        dsl.update(ALLOWANCE_SCHEDULES).set(ALLOWANCE_SCHEDULES.NEXT_DUE_ON, freq.periodStart(anchor, latestIndex + 1))
                .where(ALLOWANCE_SCHEDULES.ID.eq(id)).execute();
        return true;
    }

    /** Inserts the run row as a placeholder (status FAILED until paid) ; false if the period was already recorded. */
    private boolean claim(UUID scheduleId, LocalDate period) {
        return recordRun(scheduleId, period, "FAILED", null, "in progress");
    }

    private boolean recordRun(UUID scheduleId, LocalDate period, String status, UUID entryId, String reason) {
        return dsl.insertInto(ALLOWANCE_RUNS)
                .set(ALLOWANCE_RUNS.SCHEDULE_ID, scheduleId).set(ALLOWANCE_RUNS.PERIOD_START, period)
                .set(ALLOWANCE_RUNS.STATUS, status).set(ALLOWANCE_RUNS.ENTRY_ID, entryId).set(ALLOWANCE_RUNS.REASON, reason)
                .set(ALLOWANCE_RUNS.CREATED_AT, now())
                .onConflictDoNothing().execute() == 1;
    }
}
