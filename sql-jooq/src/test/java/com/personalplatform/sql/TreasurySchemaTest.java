package com.personalplatform.sql;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.personalplatform.sql.jooq.treasury.treasury.Treasury;
import java.util.UUID;
import java.util.function.Consumer;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.jooq.DSLContext;
import org.jooq.SQLDialect;
import org.jooq.Table;
import org.jooq.impl.DSL;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Runs both treasury Flyway locations (parseable tables + plpgsql ext) on real Postgres and proves the
 * ledger invariants live in the database itself: balanced entries, >= 2 lines, per-currency zero sum,
 * append-only, currency/household integrity, overdraft backstop.
 */
@Testcontainers
class TreasurySchemaTest {

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16");

    static DataSource dataSource;

    @BeforeAll
    static void migrate() {
        PGSimpleDataSource ds = new PGSimpleDataSource();
        ds.setUrl(POSTGRES.getJdbcUrl());
        ds.setUser(POSTGRES.getUsername());
        ds.setPassword(POSTGRES.getPassword());
        dataSource = ds;
        Flyway.configure()
                .dataSource(ds)
                .schemas("treasury")
                .defaultSchema("treasury")
                .locations("classpath:db/migration/treasury", "classpath:db/migration/treasury_ext")
                .load()
                .migrate();
    }

    private static DSLContext dsl() {
        return DSL.using(dataSource, SQLDialect.POSTGRES);
    }

    /** Runs the block in ONE transaction; deferred constraint triggers fire at the commit that ends it. */
    private static void tx(Consumer<DSLContext> work) {
        dsl().transaction(cfg -> work.accept(DSL.using(cfg)));
    }

    // --- fixtures -------------------------------------------------------------------------------------------

    record Fixture(UUID household, UUID usd1, UUID usd2, UUID eur1) {}

    private static UUID account(DSLContext d, UUID household, String code, String type, String currency, boolean allowNegative) {
        UUID id = UuidV7.next();
        d.execute("insert into treasury.accounts (id, household_id, code, name, type, currency, allow_negative, created_at) "
                + "values (?,?,?,?,?,?,?,now())", id, household, code, code, type, currency, allowNegative);
        d.execute("insert into treasury.account_balances (account_id, household_id, currency, updated_at) values (?,?,?,now())",
                id, household, currency);
        return id;
    }

    private static Fixture fixture() {
        UUID h = UuidV7.next();
        UUID[] ids = new UUID[3];
        tx(d -> {
            d.execute("insert into treasury.households (id, name, currency, created_by_uid, created_at) values (?,?,?,?,now())",
                    h, "Test", "USD", "uid-a");
            ids[0] = account(d, h, "POOL", "ASSET", "USD", false);
            ids[1] = account(d, h, "INCOME", "INCOME", "USD", false);
            ids[2] = account(d, h, "EUR", "ASSET", "EUR", false);
        });
        return new Fixture(h, ids[0], ids[1], ids[2]);
    }

    private static UUID entry(DSLContext d, UUID household, String key, int lineCount, UUID reverses) {
        UUID id = UuidV7.next();
        d.execute("insert into treasury.journal_entries (id, household_id, idempotency_key, kind, description, line_count, posted_at, "
                + "reverses_entry_id, created_by_uid) values (?,?,?,?,?,?,now(),?,?)",
                id, household, key, "DEPOSIT", "test", lineCount, reverses, "uid-a");
        return id;
    }

    private static void posting(DSLContext d, UUID entry, UUID household, UUID account, long amount, String currency) {
        d.execute("insert into treasury.postings (id, entry_id, household_id, account_id, amount, currency) values (?,?,?,?,?,?)",
                UuidV7.next(), entry, household, account, amount, currency);
    }

    /** A valid 2-line USD deposit; returns the entry id. */
    private static UUID validEntry(Fixture f, String key) {
        UUID[] id = new UUID[1];
        tx(d -> {
            id[0] = entry(d, f.household, key, 2, null);
            posting(d, id[0], f.household, f.usd1, 500, "USD");
            posting(d, id[0], f.household, f.usd2, -500, "USD");
        });
        return id[0];
    }

    // --- tests ----------------------------------------------------------------------------------------------

    @Test
    void everyGeneratedTableMatchesTheDatabase() {
        assertThat(Treasury.TREASURY.getTables()).hasSizeGreaterThanOrEqualTo(10);
        for (Table<?> table : Treasury.TREASURY.getTables()) {
            // fails if any generated column is missing or misnamed in Postgres
            dsl().selectFrom(table).limit(0).fetch();
        }
    }

    @Test
    void balancedEntryIsAccepted() {
        Fixture f = fixture();
        UUID id = validEntry(f, "ok-1");
        assertThat(dsl().fetchCount(DSL.table("treasury.postings"), DSL.field("entry_id").eq(id))).isEqualTo(2);
    }

    @Test
    void unbalancedEntryIsRejectedAtCommit() {
        Fixture f = fixture();
        assertThatThrownBy(() -> tx(d -> {
            UUID e = entry(d, f.household, "unbalanced", 2, null);
            posting(d, e, f.household, f.usd1, 500, "USD");
            posting(d, e, f.household, f.usd2, -499, "USD");
        })).rootCause().hasMessageContaining("unbalanced");
    }

    @Test
    void singleLineEntryIsRejected() {
        Fixture f = fixture();
        // declared as 2 lines but only one posting inserted
        assertThatThrownBy(() -> tx(d -> {
            UUID e = entry(d, f.household, "single", 2, null);
            posting(d, e, f.household, f.usd1, 500, "USD");
        })).rootCause().hasMessageContaining("at least 2");
        // line_count itself must be >= 2
        assertThatThrownBy(() -> tx(d -> entry(d, f.household, "single-declared", 1, null)))
                .rootCause().hasMessageContaining("line_count");
    }

    @Test
    void entryWithoutPostingsIsRejected() {
        Fixture f = fixture();
        assertThatThrownBy(() -> tx(d -> entry(d, f.household, "empty", 2, null)))
                .rootCause().hasMessageContaining("at least 2");
    }

    @Test
    void mixedCurrencyEntryThatOnlyBalancesInTotalIsRejected() {
        Fixture f = fixture();
        // +500 USD and -500 EUR: sums to zero naively, but not per currency
        assertThatThrownBy(() -> tx(d -> {
            UUID e = entry(d, f.household, "mixed", 2, null);
            posting(d, e, f.household, f.usd1, 500, "USD");
            posting(d, e, f.household, f.eur1, -500, "EUR");
        })).rootCause().hasMessageContaining("unbalanced");
    }

    @Test
    void entryDeclaringFewerLinesThanInsertedIsRejected() {
        Fixture f = fixture();
        assertThatThrownBy(() -> tx(d -> {
            UUID e = entry(d, f.household, "overfull", 2, null);
            posting(d, e, f.household, f.usd1, 500, "USD");
            posting(d, e, f.household, f.usd2, -300, "USD");
            posting(d, e, f.household, f.usd2, -200, "USD");
        })).rootCause().hasMessageContaining("declares 2 postings but has 3");
    }

    @Test
    void cannotAddBalancedPostingsToAnEntryThatAlreadyCommitted() {
        Fixture f = fixture();
        UUID e = validEntry(f, "late-lines");
        assertThatThrownBy(() -> tx(d -> {
            posting(d, e, f.household, f.usd1, 10, "USD");
            posting(d, e, f.household, f.usd2, -10, "USD");
        })).rootCause().hasMessageContaining("declares 2 postings but has 4");
    }

    @Test
    void postingsAndEntriesAreAppendOnly() {
        Fixture f = fixture();
        UUID e = validEntry(f, "immutable");
        assertThatThrownBy(() -> dsl().execute("update treasury.postings set amount = 1 where entry_id = ?", e))
                .rootCause().hasMessageContaining("append-only");
        assertThatThrownBy(() -> dsl().execute("delete from treasury.postings where entry_id = ?", e))
                .rootCause().hasMessageContaining("append-only");
        assertThatThrownBy(() -> dsl().execute("update treasury.journal_entries set description = 'x' where id = ?", e))
                .rootCause().hasMessageContaining("append-only");
        assertThatThrownBy(() -> dsl().execute("delete from treasury.journal_entries where id = ?", e))
                .rootCause().hasMessageContaining("append-only");
        assertThatThrownBy(() -> dsl().execute("truncate treasury.postings cascade")).rootCause().hasMessageContaining("append-only");
        assertThatThrownBy(() -> dsl().execute("truncate treasury.journal_entries cascade")).rootCause().hasMessageContaining("append-only");
        assertThat(dsl().fetchCount(DSL.table("treasury.postings"), DSL.field("entry_id").eq(e))).isEqualTo(2);
    }

    @Test
    void postingCurrencyMustMatchAccountCurrency() {
        Fixture f = fixture();
        // usd1 is a USD account; a EUR posting on it violates the composite foreign key
        assertThatThrownBy(() -> tx(d -> {
            UUID e = entry(d, f.household, "wrong-ccy", 2, null);
            posting(d, e, f.household, f.usd1, 500, "EUR");
            posting(d, e, f.household, f.eur1, -500, "EUR");
        })).rootCause().hasMessageContaining("violates foreign key");
    }

    @Test
    void postingCannotUseAnotherHouseholdsAccount() {
        Fixture a = fixture();
        Fixture b = fixture();
        assertThatThrownBy(() -> tx(d -> {
            UUID e = entry(d, a.household, "cross-household", 2, null);
            posting(d, e, a.household, a.usd1, 500, "USD");
            posting(d, e, a.household, b.usd2, -500, "USD");
        })).rootCause().hasMessageContaining("violates foreign key");
    }

    @Test
    void zeroAmountPostingIsRejected() {
        Fixture f = fixture();
        assertThatThrownBy(() -> tx(d -> {
            UUID e = entry(d, f.household, "zero", 2, null);
            posting(d, e, f.household, f.usd1, 0, "USD");
            posting(d, e, f.household, f.usd2, 0, "USD");
        })).rootCause().hasMessageContaining("check constraint");
    }

    @Test
    void idempotencyKeyIsUniquePerHouseholdAndAReversalCanOnlyHappenOnce() {
        Fixture a = fixture();
        Fixture b = fixture();
        UUID original = validEntry(a, "same-key");
        assertThatThrownBy(() -> validEntry(a, "same-key")).rootCause().hasMessageContaining("duplicate key");
        validEntry(b, "same-key"); // another household may reuse the key

        Runnable reverse = () -> tx(d -> {
            UUID r = entry(d, a.household, "rev-" + UUID.randomUUID(), 2, original);
            posting(d, r, a.household, a.usd1, -500, "USD");
            posting(d, r, a.household, a.usd2, 500, "USD");
        });
        // the first reversal fails only because the balance row was not touched; ledger-level it is valid
        reverse.run();
        assertThatThrownBy(reverse::run).rootCause().hasMessageContaining("duplicate key");
    }

    @Test
    void balanceProjectionRowCannotCrossZeroForAStrictAccountButMayForAnAllowNegativeOne() {
        Fixture f = fixture();
        // ASSET, allow_negative=false: negative balance rejected by the backstop trigger
        assertThatThrownBy(() -> dsl().execute("update treasury.account_balances set balance = -1 where account_id = ?", f.usd1))
                .rootCause().hasMessageContaining("overdrawn");
        // INCOME is credit-normal: negative is its natural side, positive is not
        dsl().execute("update treasury.account_balances set balance = -50 where account_id = ?", f.usd2);
        assertThatThrownBy(() -> dsl().execute("update treasury.account_balances set balance = 1 where account_id = ?", f.usd2))
                .rootCause().hasMessageContaining("overdrawn");

        UUID[] loose = new UUID[1];
        tx(d -> loose[0] = account(d, f.household, "LOOSE", "ASSET", "USD", true));
        dsl().execute("update treasury.account_balances set balance = -1 where account_id = ?", loose[0]);
    }

    @Test
    void accountIdentityIsImmutable() {
        Fixture f = fixture();
        assertThatThrownBy(() -> dsl().execute("update treasury.accounts set currency = 'EUR' where id = ?", f.usd1))
                .rootCause().hasMessageContaining("immutable");
        assertThatThrownBy(() -> dsl().execute("update treasury.accounts set type = 'EXPENSE' where id = ?", f.usd1))
                .rootCause().hasMessageContaining("immutable");
        dsl().execute("update treasury.accounts set name = 'Renamed' where id = ?", f.usd1);
    }
}
