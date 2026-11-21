package com.personalplatform.treasury.report;

import static com.personalplatform.sql.jooq.treasury.treasury.Tables.ACCOUNT_BALANCES;
import static com.personalplatform.sql.jooq.treasury.treasury.Tables.JOURNAL_ENTRIES;
import static com.personalplatform.sql.jooq.treasury.treasury.Tables.POSTINGS;

import com.personalplatform.treasury.household.AccountType;
import com.personalplatform.treasury.household.HouseholdService;
import com.personalplatform.treasury.household.Rows.AccountRow;
import com.personalplatform.treasury.household.Rows.Member;
import com.personalplatform.treasury.money.Money;
import com.personalplatform.treasury.web.ApiException;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.jooq.Condition;
import org.jooq.DSLContext;
import org.jooq.Field;
import org.jooq.Record;
import org.jooq.Select;
import org.jooq.Table;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Account statement with a running balance computed by a window function over the account's WHOLE history, then
 * filtered and paged, so every row's balance is correct regardless of the date filter or page. Amounts and balances are
 * on the account's natural side (an asset account shows deposits as +, spends as -; an income account shows income as +).
 * Ordering is (posted_at, posting seq), which is deterministic.
 */
@Service
public class StatementService {

    public static final int MAX_PAGE_SIZE = 500;
    public static final int MAX_CSV_ROWS = 100_000;

    public record StatementRow(long seq, UUID entryId, Instant postedAt, String kind, String description, long amountMinor,
                               long balanceMinor) {}

    public record Statement(UUID accountId, String code, String currency, AccountType type, int page, int size, long totalRows,
                            long currentBalanceMinor, List<StatementRow> rows) {}

    private final DSLContext dsl;
    private final HouseholdService households;

    public StatementService(DSLContext dsl, HouseholdService households) {
        this.dsl = dsl;
        this.households = households;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Statement statement(String uid, UUID householdId, UUID accountId, Instant from, Instant to, int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw ApiException.badRequest("INVALID_PAGING", "page >= 0 and 1 <= size <= " + MAX_PAGE_SIZE);
        }
        AccountRow account = visibleAccount(uid, householdId, accountId);
        Table<?> s = windowed(accountId, account.type());
        Condition filter = filter(s, from, to);
        long total = dsl.fetchCount(dsl.selectFrom(s).where(filter));
        List<StatementRow> rows = fetchRows(s, filter, size, (long) page * size);
        long current = account.type().natural(dsl.select(ACCOUNT_BALANCES.BALANCE).from(ACCOUNT_BALANCES)
                .where(ACCOUNT_BALANCES.ACCOUNT_ID.eq(accountId)).fetchOne(ACCOUNT_BALANCES.BALANCE));
        return new Statement(accountId, account.code(), account.currency(), account.type(), page, size, total, current, rows);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public String csv(String uid, UUID householdId, UUID accountId, Instant from, Instant to) {
        AccountRow account = visibleAccount(uid, householdId, accountId);
        Table<?> s = windowed(accountId, account.type());
        List<StatementRow> rows = fetchRows(s, filter(s, from, to), MAX_CSV_ROWS, 0);
        StringBuilder sb = new StringBuilder("posted_at,entry_id,kind,description,amount,balance,currency\r\n");
        for (StatementRow r : rows) {
            sb.append(r.postedAt()).append(',').append(r.entryId()).append(',').append(r.kind()).append(',')
                    .append(cell(r.description())).append(',')
                    .append(Money.of(r.amountMinor(), account.currency()).toDecimalString()).append(',')
                    .append(Money.of(r.balanceMinor(), account.currency()).toDecimalString()).append(',')
                    .append(account.currency()).append("\r\n");
        }
        return sb.toString();
    }

    private AccountRow visibleAccount(String uid, UUID householdId, UUID accountId) {
        Member m = households.requireMember(householdId, uid);
        AccountRow account = households.account(householdId, accountId);
        if (!HouseholdService.canView(m, account)) {
            throw ApiException.notFound("account");
        }
        return account;
    }

    private Table<?> windowed(UUID accountId, AccountType type) {
        int sign = type.debitNormal() ? 1 : -1;
        Field<Long> amount = POSTINGS.AMOUNT.mul(sign);
        Field<BigDecimal> running = DSL.sum(amount).over()
                .orderBy(JOURNAL_ENTRIES.POSTED_AT, POSTINGS.SEQ)
                .rowsBetweenUnboundedPreceding().andCurrentRow();
        Select<?> inner = dsl.select(
                        POSTINGS.SEQ.as("seq"), JOURNAL_ENTRIES.ID.as("entry_id"), JOURNAL_ENTRIES.POSTED_AT.as("posted_at"),
                        JOURNAL_ENTRIES.KIND.as("kind"), JOURNAL_ENTRIES.DESCRIPTION.as("description"),
                        amount.as("amount"), running.as("running"))
                .from(POSTINGS).join(JOURNAL_ENTRIES).on(JOURNAL_ENTRIES.ID.eq(POSTINGS.ENTRY_ID))
                .where(POSTINGS.ACCOUNT_ID.eq(accountId));
        return inner.asTable("s");
    }

    private static Condition filter(Table<?> s, Instant from, Instant to) {
        Field<OffsetDateTime> at = s.field("posted_at", OffsetDateTime.class);
        Condition c = DSL.trueCondition();
        if (from != null) {
            c = c.and(at.ge(OffsetDateTime.ofInstant(from, ZoneOffset.UTC)));
        }
        if (to != null) {
            c = c.and(at.lt(OffsetDateTime.ofInstant(to, ZoneOffset.UTC)));
        }
        return c;
    }

    private List<StatementRow> fetchRows(Table<?> s, Condition filter, int limit, long offset) {
        return dsl.select(s.fields()).from(s).where(filter)
                .orderBy(s.field("posted_at"), s.field("seq"))
                .limit(limit).offset(offset)
                .fetch(r -> new StatementRow(r.get("seq", Long.class), r.get("entry_id", UUID.class),
                        r.get("posted_at", OffsetDateTime.class).toInstant(), r.get("kind", String.class),
                        r.get("description", String.class), r.get("amount", Long.class),
                        r.get("running", BigDecimal.class).longValueExact()));
    }

    /** RFC 4180 quoting plus neutralisation of spreadsheet formula injection (cells starting with = + - @ tab CR). */
    static String cell(String value) {
        String v = value == null ? "" : value;
        if (!v.isEmpty() && "=+-@\t\r".indexOf(v.charAt(0)) >= 0) {
            v = "'" + v;
        }
        if (v.contains(",") || v.contains("\"") || v.contains("\n") || v.contains("\r")) {
            v = "\"" + v.replace("\"", "\"\"") + "\"";
        }
        return v;
    }
}
