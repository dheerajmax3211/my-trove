package com.personalplatform.treasury.ops;

import static com.personalplatform.sql.jooq.treasury.treasury.Tables.APPROVAL_REQUESTS;

import com.personalplatform.sql.UuidV7;
import com.personalplatform.treasury.approval.ApprovalService;
import com.personalplatform.treasury.approval.ApprovalView;
import com.personalplatform.treasury.household.AccountType;
import com.personalplatform.treasury.household.HouseholdService;
import com.personalplatform.treasury.household.Role;
import com.personalplatform.treasury.household.Rows.AccountRow;
import com.personalplatform.treasury.household.Rows.HouseholdRow;
import com.personalplatform.treasury.household.Rows.Member;
import com.personalplatform.treasury.ledger.EntryKind;
import com.personalplatform.treasury.ledger.EntryView;
import com.personalplatform.treasury.ledger.IdempotencyService;
import com.personalplatform.treasury.ledger.IdempotencyService.Outcome;
import com.personalplatform.treasury.ledger.IdempotencyService.Result;
import com.personalplatform.treasury.ledger.LedgerEngine;
import com.personalplatform.treasury.ledger.LedgerEngine.Line;
import com.personalplatform.treasury.money.Money;
import com.personalplatform.treasury.ops.OpsDtos.DepositRequest;
import com.personalplatform.treasury.ops.OpsDtos.ReverseRequest;
import com.personalplatform.treasury.ops.OpsDtos.Share;
import com.personalplatform.treasury.ops.OpsDtos.SpendRequest;
import com.personalplatform.treasury.ops.OpsDtos.SpendResult;
import com.personalplatform.treasury.ops.OpsDtos.SplitRequest;
import com.personalplatform.treasury.ops.OpsDtos.SplitResult;
import com.personalplatform.treasury.ops.OpsDtos.TransferRequest;
import com.personalplatform.treasury.web.ApiException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Domain operations. Each is ONE database transaction that (a) claims the Idempotency-Key, (b) checks household
 * membership/role, and (c) posts exactly one journal entry (or, for a large spend, one approval request instead).
 */
@Service
public class TreasuryOps {

    private final HouseholdService households;
    private final LedgerEngine ledger;
    private final IdempotencyService idempotency;
    private final ApprovalService approvals;

    public TreasuryOps(HouseholdService households, LedgerEngine ledger, IdempotencyService idempotency, ApprovalService approvals) {
        this.households = households;
        this.ledger = ledger;
        this.idempotency = idempotency;
        this.approvals = approvals;
    }

    /** Entry-level idempotency keys of user operations are prefixed so they can never collide with system keys. */
    static String entryKey(String key) {
        return "k:" + key;
    }

    private AccountRow expect(UUID householdId, UUID id, String defaultCode, AccountType type) {
        AccountRow a = id == null ? households.accountByCode(householdId, defaultCode) : households.account(householdId, id);
        if (a.type() != type) {
            throw ApiException.unprocessable("WRONG_ACCOUNT_TYPE", "account " + a.code() + " must be of type " + type);
        }
        return a;
    }

    private static void sameCurrency(AccountRow a, AccountRow b) {
        if (!a.currency().equals(b.currency())) {
            throw ApiException.unprocessable("CURRENCY_MISMATCH", "accounts " + a.code() + " and " + b.code() + " use different currencies");
        }
    }

    // ---- deposit -------------------------------------------------------------------------------------------

    @Transactional
    public Outcome<EntryView> deposit(String uid, UUID householdId, String key, DepositRequest req) {
        Member m = households.requireMember(householdId, uid);
        return idempotency.execute(householdId.toString(), key, new Object[] {"deposit", uid, req}, EntryView.class, () -> {
            if (m.role() == Role.KID) {
                throw ApiException.forbidden("ROLE_NOT_ALLOWED", "kids cannot deposit");
            }
            AccountRow to = expect(householdId, req.toAccountId(), HouseholdService.POOL, AccountType.ASSET);
            AccountRow income = expect(householdId, req.incomeAccountId(), HouseholdService.INCOME_DEPOSITS, AccountType.INCOME);
            sameCurrency(to, income);
            Money amount = Money.of(req.amountMinor(), to.currency());
            EntryView e = ledger.post(householdId, entryKey(key), EntryKind.DEPOSIT, req.description(), null, null, uid,
                    List.of(new Line(to.id(), amount.minor()), new Line(income.id(), -amount.minor())));
            return new Result<>(HttpStatus.CREATED.value(), e);
        });
    }

    // ---- spend (+ approval gate) ---------------------------------------------------------------------------

    @Transactional
    public Outcome<SpendResult> spend(String uid, UUID householdId, String key, SpendRequest req) {
        Member m = households.requireMember(householdId, uid);
        return idempotency.execute(householdId.toString(), key, new Object[] {"spend", uid, req}, SpendResult.class, () -> {
            AccountRow from = expect(householdId, req.fromAccountId(), HouseholdService.POOL, AccountType.ASSET);
            AccountRow category = expect(householdId, req.categoryAccountId(), HouseholdService.EXPENSE_GENERAL, AccountType.EXPENSE);
            sameCurrency(from, category);
            if (!HouseholdService.canDebit(m, from)) {
                throw ApiException.forbidden("ACCOUNT_NOT_ALLOWED", "you may not spend from " + from.code());
            }
            HouseholdRow h = households.household(householdId);
            if (h.approvalThreshold() != null && req.amountMinor() > h.approvalThreshold()) {
                ApprovalView a = approvals.create(h, uid, from, category, req.amountMinor(), req.description());
                return new Result<>(HttpStatus.ACCEPTED.value(), new SpendResult("PENDING_APPROVAL", null, a));
            }
            EntryView e = ledger.post(householdId, entryKey(key), EntryKind.SPEND, req.description(), null, null, uid,
                    List.of(new Line(from.id(), -req.amountMinor()), new Line(category.id(), req.amountMinor())));
            return new Result<>(HttpStatus.CREATED.value(), new SpendResult("POSTED", e, null));
        });
    }

    // ---- transfer ------------------------------------------------------------------------------------------

    @Transactional
    public Outcome<EntryView> transfer(String uid, UUID householdId, String key, TransferRequest req) {
        Member m = households.requireMember(householdId, uid);
        return idempotency.execute(householdId.toString(), key, new Object[] {"transfer", uid, req}, EntryView.class, () -> {
            if (req.fromAccountId().equals(req.toAccountId())) {
                throw ApiException.badRequest("SAME_ACCOUNT", "source and destination must differ");
            }
            AccountRow from = expect(householdId, req.fromAccountId(), null, AccountType.ASSET);
            AccountRow to = expect(householdId, req.toAccountId(), null, AccountType.ASSET);
            sameCurrency(from, to);
            // Moving money out of a household-level account is as sensitive as spending it: trusted roles only.
            boolean allowed = from.ownerUid() == null ? m.role().isTrusted() : HouseholdService.canDebit(m, from);
            if (!allowed) {
                throw ApiException.forbidden("ACCOUNT_NOT_ALLOWED", "you may not transfer out of " + from.code());
            }
            EntryView e = ledger.post(householdId, entryKey(key), EntryKind.TRANSFER, req.description(), null, null, uid,
                    List.of(new Line(from.id(), -req.amountMinor()), new Line(to.id(), req.amountMinor())));
            return new Result<>(HttpStatus.CREATED.value(), e);
        });
    }

    // ---- split ---------------------------------------------------------------------------------------------

    @Transactional
    public Outcome<SplitResult> split(String uid, UUID householdId, String key, SplitRequest req) {
        Member m = households.requireMember(householdId, uid);
        return idempotency.execute(householdId.toString(), key, new Object[] {"split", uid, req}, SplitResult.class, () -> {
            AccountRow expense = expect(householdId, req.expenseAccountId(), HouseholdService.EXPENSE_GENERAL, AccountType.EXPENSE);
            Set<UUID> seen = new HashSet<>();
            long[] weights = new long[req.shares().size()];
            List<AccountRow> pots = new ArrayList<>();
            for (int i = 0; i < weights.length; i++) {
                Share s = req.shares().get(i);
                if (!seen.add(s.accountId())) {
                    throw ApiException.badRequest("DUPLICATE_SHARE", "an account may appear only once in a split");
                }
                AccountRow pot = households.account(householdId, s.accountId());
                // The shared pool is guarded by approvals, so a split may only draw on member pots.
                if (pot.type() != AccountType.ASSET || pot.ownerUid() == null) {
                    throw ApiException.unprocessable("WRONG_ACCOUNT_TYPE", "split shares must be member pots");
                }
                sameCurrency(pot, expense);
                if (!HouseholdService.canDebit(m, pot)) {
                    throw ApiException.forbidden("ACCOUNT_NOT_ALLOWED", "you may not draw on " + pot.code());
                }
                pots.add(pot);
                weights[i] = s.weight() == null ? 1 : s.weight();
            }
            long[] parts = Money.allocateMinor(req.totalMinor(), weights);
            List<Line> lines = new ArrayList<>();
            List<SplitResult.Allocation> allocations = new ArrayList<>();
            lines.add(new Line(expense.id(), req.totalMinor()));
            for (int i = 0; i < parts.length; i++) {
                allocations.add(new SplitResult.Allocation(pots.get(i).id(), parts[i]));
                if (parts[i] != 0) {
                    lines.add(new Line(pots.get(i).id(), -parts[i]));
                }
            }
            EntryView e = ledger.post(householdId, entryKey(key), EntryKind.SPLIT, req.description(), null, null, uid, lines);
            return new Result<>(HttpStatus.CREATED.value(), new SplitResult(e, allocations));
        });
    }

    // ---- reversal ------------------------------------------------------------------------------------------

    /** Posts a mirrored entry (every amount negated). The original is never touched; it can be reversed only once. */
    @Transactional
    public Outcome<EntryView> reverse(String uid, UUID householdId, String key, UUID entryId, ReverseRequest req) {
        households.requireRole(householdId, uid, Role.OWNER, Role.APPROVER);
        return idempotency.execute(householdId.toString(), key, new Object[] {"reverse", uid, entryId, req}, EntryView.class, () -> {
            ledger.lockEntry(householdId, entryId); // serialises concurrent reversals of the same entry
            EntryView original = ledger.get(householdId, entryId);
            if (original.kind() == EntryKind.REVERSAL) {
                throw ApiException.unprocessable("CANNOT_REVERSE_REVERSAL", "a reversal entry cannot itself be reversed");
            }
            if (ledger.reversalOf(entryId) != null) {
                throw ApiException.conflict("ALREADY_REVERSED", "entry has already been reversed");
            }
            List<Line> mirrored = original.postings().stream().map(p -> new Line(p.accountId(), Math.negateExact(p.amountMinor()))).toList();
            String reason = req == null || req.reason() == null || req.reason().isBlank() ? "" : " (" + req.reason() + ")";
            String description = "Reversal of: " + original.description() + reason;
            if (description.length() > 500) {
                description = description.substring(0, 500);
            }
            EntryView e = ledger.post(householdId, entryKey(key), EntryKind.REVERSAL, description, entryId, null, uid, mirrored);
            return new Result<>(HttpStatus.CREATED.value(), e);
        });
    }

    // ---- reads ---------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public EntryView entry(String uid, UUID householdId, UUID entryId) {
        Member m = households.requireMember(householdId, uid);
        if (m.role() == Role.KID) {
            throw ApiException.forbidden("ROLE_NOT_ALLOWED", "kids cannot read journal entries");
        }
        return ledger.get(householdId, entryId);
    }

    @Transactional(readOnly = true)
    public List<EntryView> entries(String uid, UUID householdId, int page, int size) {
        Member m = households.requireMember(householdId, uid);
        if (m.role() == Role.KID) {
            throw ApiException.forbidden("ROLE_NOT_ALLOWED", "kids cannot read journal entries");
        }
        return ledger.list(householdId, page, size);
    }
}
