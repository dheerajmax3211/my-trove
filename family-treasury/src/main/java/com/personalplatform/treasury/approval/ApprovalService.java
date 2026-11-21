package com.personalplatform.treasury.approval;

import static com.personalplatform.sql.jooq.treasury.treasury.Tables.APPROVAL_REQUESTS;

import com.personalplatform.sql.UuidV7;
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
import com.personalplatform.treasury.web.ApiException;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.jooq.Condition;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Small approval workflow for spends above the household threshold: PENDING_APPROVAL -> APPROVED | REJECTED | EXPIRED.
 * No ledger entry exists while pending. Approval posts the entry in the same transaction that flips the status, under a
 * row lock on the request, so a request is posted at most once. The requester can never approve their own request.
 */
@Service
public class ApprovalService {

    public static final String PENDING = "PENDING_APPROVAL";

    private final DSLContext dsl;
    private final Clock clock;
    private final HouseholdService households;
    private final LedgerEngine ledger;
    private final IdempotencyService idempotency;

    public ApprovalService(DSLContext dsl, Clock clock, HouseholdService households, LedgerEngine ledger,
                           IdempotencyService idempotency) {
        this.dsl = dsl;
        this.clock = clock;
        this.households = households;
        this.ledger = ledger;
        this.idempotency = idempotency;
    }

    private OffsetDateTime now() {
        return OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public ApprovalView create(HouseholdRow h, String requester, AccountRow from, AccountRow category, long amount, String description) {
        UUID id = UuidV7.next();
        OffsetDateTime now = now();
        dsl.insertInto(APPROVAL_REQUESTS)
                .set(APPROVAL_REQUESTS.ID, id).set(APPROVAL_REQUESTS.HOUSEHOLD_ID, h.id())
                .set(APPROVAL_REQUESTS.REQUESTED_BY_UID, requester).set(APPROVAL_REQUESTS.KIND, "SPEND")
                .set(APPROVAL_REQUESTS.FROM_ACCOUNT_ID, from.id()).set(APPROVAL_REQUESTS.TO_ACCOUNT_ID, category.id())
                .set(APPROVAL_REQUESTS.AMOUNT, amount).set(APPROVAL_REQUESTS.CURRENCY, from.currency())
                .set(APPROVAL_REQUESTS.DESCRIPTION, description).set(APPROVAL_REQUESTS.STATUS, PENDING)
                .set(APPROVAL_REQUESTS.EXPIRES_AT, now.plusHours(h.approvalExpiryHours()))
                .set(APPROVAL_REQUESTS.CREATED_AT, now)
                .execute();
        return load(h.id(), id, false);
    }

    private ApprovalView toView(Record r) {
        String status = r.get(APPROVAL_REQUESTS.STATUS);
        OffsetDateTime expires = r.get(APPROVAL_REQUESTS.EXPIRES_AT);
        if (PENDING.equals(status) && !expires.isAfter(now())) {
            status = "EXPIRED"; // reported as expired immediately; the sweep persists it
        }
        OffsetDateTime decidedAt = r.get(APPROVAL_REQUESTS.DECIDED_AT);
        return new ApprovalView(r.get(APPROVAL_REQUESTS.ID), r.get(APPROVAL_REQUESTS.HOUSEHOLD_ID),
                r.get(APPROVAL_REQUESTS.REQUESTED_BY_UID), r.get(APPROVAL_REQUESTS.FROM_ACCOUNT_ID),
                r.get(APPROVAL_REQUESTS.TO_ACCOUNT_ID), r.get(APPROVAL_REQUESTS.AMOUNT), r.get(APPROVAL_REQUESTS.CURRENCY),
                r.get(APPROVAL_REQUESTS.DESCRIPTION), status, expires.toInstant(), r.get(APPROVAL_REQUESTS.DECIDED_BY_UID),
                decidedAt == null ? null : decidedAt.toInstant(), r.get(APPROVAL_REQUESTS.DECISION_NOTE),
                r.get(APPROVAL_REQUESTS.ENTRY_ID), r.get(APPROVAL_REQUESTS.CREATED_AT).toInstant());
    }

    private ApprovalView load(UUID householdId, UUID id, boolean lock) {
        var q = dsl.select(APPROVAL_REQUESTS.fields()).from(APPROVAL_REQUESTS)
                .where(APPROVAL_REQUESTS.ID.eq(id).and(APPROVAL_REQUESTS.HOUSEHOLD_ID.eq(householdId)));
        Record r = lock ? q.forUpdate().fetchOne() : q.fetchOne();
        if (r == null) {
            throw ApiException.notFound("approval request");
        }
        return toView(r);
    }

    @Transactional(readOnly = true)
    public ApprovalView get(String uid, UUID householdId, UUID id) {
        Member m = households.requireMember(householdId, uid);
        ApprovalView v = load(householdId, id, false);
        if (m.role() == Role.KID && !v.requestedByUid().equals(uid)) {
            throw ApiException.notFound("approval request");
        }
        return v;
    }

    /** Effective status filter (a pending request past its expiry counts as EXPIRED). Kids only see their own. */
    @Transactional(readOnly = true)
    public List<ApprovalView> list(String uid, UUID householdId, String status) {
        Member m = households.requireMember(householdId, uid);
        Condition c = APPROVAL_REQUESTS.HOUSEHOLD_ID.eq(householdId);
        if (m.role() == Role.KID) {
            c = c.and(APPROVAL_REQUESTS.REQUESTED_BY_UID.eq(uid));
        }
        return dsl.select(APPROVAL_REQUESTS.fields()).from(APPROVAL_REQUESTS).where(c)
                .orderBy(APPROVAL_REQUESTS.CREATED_AT.desc(), APPROVAL_REQUESTS.ID.desc())
                .fetch(this::toView).stream()
                .filter(v -> status == null || status.equals(v.status()))
                .toList();
    }

    @Transactional
    public Outcome<ApprovalView> approve(String uid, UUID householdId, String key, UUID id) {
        Member m = households.requireMember(householdId, uid);
        return idempotency.execute(householdId.toString(), key, new Object[] {"approve", uid, id}, ApprovalView.class, () -> {
            if (!m.role().canApprove()) {
                throw ApiException.forbidden("ROLE_NOT_ALLOWED", "only an OWNER or APPROVER can approve");
            }
            ApprovalView a = load(householdId, id, true); // row lock: decisions on one request are serialised
            if (a.requestedByUid().equals(uid)) {
                throw ApiException.forbidden("SELF_APPROVAL", "you cannot approve your own request");
            }
            requireDecidable(a);
            EntryView e = ledger.post(householdId, "approval:" + id, EntryKind.SPEND, a.description(), null, id, uid,
                    List.of(new Line(a.fromAccountId(), -a.amountMinor()), new Line(a.toAccountId(), a.amountMinor())));
            dsl.update(APPROVAL_REQUESTS)
                    .set(APPROVAL_REQUESTS.STATUS, "APPROVED").set(APPROVAL_REQUESTS.DECIDED_BY_UID, uid)
                    .set(APPROVAL_REQUESTS.DECIDED_AT, now()).set(APPROVAL_REQUESTS.ENTRY_ID, e.id())
                    .where(APPROVAL_REQUESTS.ID.eq(id)).execute();
            return new Result<>(HttpStatus.OK.value(), load(householdId, id, false));
        });
    }

    /** Approvers/owners can reject others' requests; a requester can withdraw (reject) their own. */
    @Transactional
    public Outcome<ApprovalView> reject(String uid, UUID householdId, String key, UUID id, String note) {
        Member m = households.requireMember(householdId, uid);
        return idempotency.execute(householdId.toString(), key, new Object[] {"reject", uid, id, note}, ApprovalView.class, () -> {
            ApprovalView a = load(householdId, id, true);
            if (!m.role().canApprove() && !a.requestedByUid().equals(uid)) {
                throw ApiException.forbidden("ROLE_NOT_ALLOWED", "only an OWNER or APPROVER (or the requester) can reject");
            }
            requireDecidable(a);
            dsl.update(APPROVAL_REQUESTS)
                    .set(APPROVAL_REQUESTS.STATUS, "REJECTED").set(APPROVAL_REQUESTS.DECIDED_BY_UID, uid)
                    .set(APPROVAL_REQUESTS.DECIDED_AT, now()).set(APPROVAL_REQUESTS.DECISION_NOTE, note)
                    .where(APPROVAL_REQUESTS.ID.eq(id)).execute();
            return new Result<>(HttpStatus.OK.value(), load(householdId, id, false));
        });
    }

    private static void requireDecidable(ApprovalView a) {
        if (a.status().equals("EXPIRED")) {
            throw ApiException.conflict("APPROVAL_EXPIRED", "approval request has expired");
        }
        if (!PENDING.equals(a.status())) {
            throw ApiException.conflict("ALREADY_DECIDED", "approval request is already " + a.status());
        }
    }

    /** Persists expiry for every pending request past its deadline (idempotent; run by the scheduler). */
    @Transactional
    public int expireDue() {
        return dsl.update(APPROVAL_REQUESTS)
                .set(APPROVAL_REQUESTS.STATUS, "EXPIRED")
                .where(APPROVAL_REQUESTS.STATUS.eq(PENDING).and(APPROVAL_REQUESTS.EXPIRES_AT.le(now())))
                .execute();
    }
}
