package com.personalplatform.treasury.report;

import static com.personalplatform.sql.jooq.treasury.treasury.Tables.ACCOUNTS;
import static com.personalplatform.sql.jooq.treasury.treasury.Tables.ACCOUNT_BALANCES;
import static com.personalplatform.sql.jooq.treasury.treasury.Tables.HOUSEHOLDS;
import static com.personalplatform.sql.jooq.treasury.treasury.Tables.POSTINGS;

import com.personalplatform.treasury.household.HouseholdService;
import com.personalplatform.treasury.household.Role;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.jooq.DSLContext;
import org.jooq.Field;
import org.jooq.Record2;
import org.jooq.Table;
import org.jooq.impl.DSL;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Proves the read model against the source of truth: for every account, {@code account_balances.balance} must equal
 * {@code SUM(postings.amount)}; and per currency the whole household ledger must sum to zero. Both comparisons run in ONE
 * REPEATABLE READ snapshot, so concurrent postings cannot cause false drift. Drift is reported, never silently repaired.
 */
@Service
public class ReconciliationService {

    private static final Logger log = LoggerFactory.getLogger(ReconciliationService.class);

    public record Drift(UUID accountId, String code, Long projectedMinor, long ledgerMinor, long driftMinor) {}

    public record Imbalance(String currency, long totalMinor) {}

    public record Report(UUID householdId, Instant checkedAt, int accountsChecked, boolean consistent, List<Drift> drifts,
                         List<Imbalance> ledgerImbalances) {}

    private final DSLContext dsl;
    private final HouseholdService households;
    private final Clock clock;
    private final TransactionTemplate snapshotTx;

    public ReconciliationService(DSLContext dsl, HouseholdService households, Clock clock, PlatformTransactionManager tm) {
        this.dsl = dsl;
        this.households = households;
        this.clock = clock;
        this.snapshotTx = new TransactionTemplate(tm);
        this.snapshotTx.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        this.snapshotTx.setReadOnly(true);
    }

    /** Endpoint entry point: trusted roles only. */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Report reconcile(String uid, UUID householdId) {
        households.requireRole(householdId, uid, Role.OWNER, Role.APPROVER);
        return reconcile(householdId);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Report reconcile(UUID householdId) {
        Field<BigDecimal> sum = DSL.sum(POSTINGS.AMOUNT).as("s");
        Table<Record2<UUID, BigDecimal>> sums = dsl.select(POSTINGS.ACCOUNT_ID, sum)
                .from(POSTINGS).where(POSTINGS.HOUSEHOLD_ID.eq(householdId)).groupBy(POSTINGS.ACCOUNT_ID).asTable("p");
        Field<UUID> pAccount = sums.field(0, UUID.class);
        Field<BigDecimal> pSum = sums.field(1, BigDecimal.class);

        var rows = dsl.select(ACCOUNTS.ID, ACCOUNTS.CODE, ACCOUNT_BALANCES.BALANCE, pSum)
                .from(ACCOUNTS)
                .leftJoin(ACCOUNT_BALANCES).on(ACCOUNT_BALANCES.ACCOUNT_ID.eq(ACCOUNTS.ID))
                .leftJoin(sums).on(pAccount.eq(ACCOUNTS.ID))
                .where(ACCOUNTS.HOUSEHOLD_ID.eq(householdId))
                .orderBy(ACCOUNTS.CODE)
                .fetch();

        List<Drift> drifts = rows.stream()
                .map(r -> {
                    long ledger = r.value4() == null ? 0L : r.value4().longValueExact();
                    Long projected = r.value3();
                    long drift = (projected == null ? 0L : projected) - ledger;
                    return new Drift(r.value1(), r.value2(), projected, ledger, drift);
                })
                .filter(d -> d.projectedMinor() == null || d.driftMinor() != 0)
                .toList();

        List<Imbalance> imbalances = dsl.select(POSTINGS.CURRENCY, DSL.sum(POSTINGS.AMOUNT))
                .from(POSTINGS).where(POSTINGS.HOUSEHOLD_ID.eq(householdId))
                .groupBy(POSTINGS.CURRENCY)
                .having(DSL.sum(POSTINGS.AMOUNT).ne(BigDecimal.ZERO))
                .fetch(r -> new Imbalance(r.value1(), r.value2().longValueExact()));

        return new Report(householdId, clock.instant(), rows.size(), drifts.isEmpty() && imbalances.isEmpty(), drifts, imbalances);
    }

    /** Scheduled job: checks every household and logs loudly on drift. Returns the number of inconsistent households. */
    public int reconcileAll() {
        int bad = 0;
        for (UUID id : dsl.select(HOUSEHOLDS.ID).from(HOUSEHOLDS).fetch(HOUSEHOLDS.ID)) {
            Report r = snapshotTx.execute(status -> reconcile(id));
            if (!r.consistent()) {
                bad++;
                log.error("LEDGER RECONCILIATION DRIFT in household {}: {} drifting account(s), {} imbalance(s)", id,
                        r.drifts().size(), r.ledgerImbalances().size());
            }
        }
        return bad;
    }
}
