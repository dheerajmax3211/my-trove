package com.personalplatform.treasury.household;

import static com.personalplatform.sql.jooq.treasury.treasury.Tables.ACCOUNTS;
import static com.personalplatform.sql.jooq.treasury.treasury.Tables.ACCOUNT_BALANCES;
import static com.personalplatform.sql.jooq.treasury.treasury.Tables.HOUSEHOLDS;
import static com.personalplatform.sql.jooq.treasury.treasury.Tables.HOUSEHOLD_INVITES;
import static com.personalplatform.sql.jooq.treasury.treasury.Tables.HOUSEHOLD_MEMBERS;

import com.personalplatform.notify.Notification;
import com.personalplatform.notify.NotificationOutbox;
import com.personalplatform.sql.UuidV7;
import com.personalplatform.treasury.household.Dtos.AccountView;
import com.personalplatform.treasury.household.Dtos.InviteCreated;
import com.personalplatform.treasury.household.Dtos.InviteView;
import com.personalplatform.treasury.household.Dtos.AddMemberRequest;
import com.personalplatform.treasury.household.Dtos.CreateAccountRequest;
import com.personalplatform.treasury.household.Dtos.CreateHouseholdRequest;
import com.personalplatform.treasury.household.Dtos.HouseholdView;
import com.personalplatform.treasury.household.Dtos.MemberView;
import com.personalplatform.treasury.household.Dtos.UpdateSettingsRequest;
import com.personalplatform.treasury.household.Rows.AccountRow;
import com.personalplatform.treasury.household.Rows.HouseholdRow;
import com.personalplatform.treasury.household.Rows.Member;
import com.personalplatform.treasury.ledger.IdempotencyService;
import com.personalplatform.treasury.ledger.IdempotencyService.Outcome;
import com.personalplatform.treasury.ledger.IdempotencyService.Result;
import com.personalplatform.treasury.money.Money;
import com.personalplatform.treasury.web.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.jooq.DSLContext;
import org.jooq.Record;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Households, membership (a table owned by this service for the first slice; a later integration will source it from
 * shared-service) and the chart of accounts. Every other service goes through {@link #requireMember} first, so a
 * caller outside the household gets 404 and never learns that the household exists.
 */
@Service
public class HouseholdService {

    public static final String POOL = "POOL";
    public static final String INCOME_DEPOSITS = "INCOME:DEPOSITS";
    public static final String EXPENSE_GENERAL = "EXPENSE:GENERAL";

    private final DSLContext dsl;
    private final Clock clock;
    private final IdempotencyService idempotency;
    private final NotificationOutbox outbox;

    public HouseholdService(DSLContext dsl, Clock clock, IdempotencyService idempotency, NotificationOutbox outbox) {
        this.dsl = dsl;
        this.clock = clock;
        this.idempotency = idempotency;
        this.outbox = outbox;
    }

    private OffsetDateTime now() {
        return OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC);
    }

    // ---- membership guards ---------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Member requireMember(UUID householdId, String uid) {
        Member m = dsl.select(HOUSEHOLD_MEMBERS.ROLE)
                .from(HOUSEHOLD_MEMBERS)
                .where(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID.eq(householdId).and(HOUSEHOLD_MEMBERS.UID.eq(uid)))
                .fetchOne(r -> new Member(householdId, uid, Role.valueOf(r.value1())));
        if (m == null) {
            throw ApiException.notFound("household");
        }
        return m;
    }

    /** Membership plus a role requirement: 404 for outsiders, 403 for members whose role is too weak. */
    public Member requireRole(UUID householdId, String uid, Role... allowed) {
        Member m = requireMember(householdId, uid);
        for (Role r : allowed) {
            if (m.role() == r) {
                return m;
            }
        }
        throw ApiException.forbidden("ROLE_NOT_ALLOWED", "role " + m.role() + " may not perform this action");
    }

    public static boolean canDebit(Member m, AccountRow a) {
        if (m.role().isTrusted()) {
            return true;
        }
        if (m.role() == Role.MEMBER) {
            return a.ownerUid() == null || a.ownerUid().equals(m.uid());
        }
        return m.uid().equals(a.ownerUid()); // KID: own pot only
    }

    public static boolean canView(Member m, AccountRow a) {
        return m.role() != Role.KID || a.ownerUid() == null || a.ownerUid().equals(m.uid());
    }

    // ---- reads ---------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public HouseholdRow household(UUID id) {
        HouseholdRow h = dsl.select(HOUSEHOLDS.ID, HOUSEHOLDS.NAME, HOUSEHOLDS.CURRENCY, HOUSEHOLDS.APPROVAL_THRESHOLD,
                        HOUSEHOLDS.APPROVAL_EXPIRY_HOURS)
                .from(HOUSEHOLDS).where(HOUSEHOLDS.ID.eq(id))
                .fetchOne(r -> new HouseholdRow(r.value1(), r.value2(), r.value3(), r.value4(), r.value5()));
        if (h == null) {
            throw ApiException.notFound("household");
        }
        return h;
    }

    private static AccountRow toRow(Record r) {
        return new AccountRow(r.get(ACCOUNTS.ID), r.get(ACCOUNTS.HOUSEHOLD_ID), r.get(ACCOUNTS.OWNER_UID), r.get(ACCOUNTS.CODE),
                r.get(ACCOUNTS.NAME), AccountType.valueOf(r.get(ACCOUNTS.TYPE)), r.get(ACCOUNTS.CURRENCY),
                r.get(ACCOUNTS.ALLOW_NEGATIVE));
    }

    /** Account within the household (so ids from another household look like they do not exist). */
    @Transactional(readOnly = true)
    public AccountRow account(UUID householdId, UUID accountId) {
        Record r = dsl.select(ACCOUNTS.fields()).from(ACCOUNTS)
                .where(ACCOUNTS.ID.eq(accountId).and(ACCOUNTS.HOUSEHOLD_ID.eq(householdId))).fetchOne();
        if (r == null) {
            throw ApiException.notFound("account");
        }
        return toRow(r);
    }

    @Transactional(readOnly = true)
    public AccountRow accountByCode(UUID householdId, String code) {
        Record r = dsl.select(ACCOUNTS.fields()).from(ACCOUNTS)
                .where(ACCOUNTS.CODE.eq(code).and(ACCOUNTS.HOUSEHOLD_ID.eq(householdId))).fetchOne();
        if (r == null) {
            throw ApiException.notFound("account " + code);
        }
        return toRow(r);
    }

    @Transactional(readOnly = true)
    public List<AccountView> accounts(UUID householdId, Member viewer) {
        return dsl.select(ACCOUNTS.fields()).select(ACCOUNT_BALANCES.BALANCE)
                .from(ACCOUNTS).join(ACCOUNT_BALANCES).on(ACCOUNT_BALANCES.ACCOUNT_ID.eq(ACCOUNTS.ID))
                .where(ACCOUNTS.HOUSEHOLD_ID.eq(householdId))
                .orderBy(ACCOUNTS.CODE)
                .fetch().stream()
                .filter(r -> canView(viewer, toRow(r)))
                .map(r -> {
                    AccountRow a = toRow(r);
                    long raw = r.get(ACCOUNT_BALANCES.BALANCE);
                    return new AccountView(a.id(), a.code(), a.name(), a.type(), a.currency(), a.ownerUid(), a.allowNegative(),
                            a.type().natural(raw), raw);
                }).toList();
    }

    @Transactional(readOnly = true)
    public AccountView accountView(UUID householdId, UUID accountId, Member viewer) {
        AccountRow a = account(householdId, accountId);
        if (!canView(viewer, a)) {
            throw ApiException.notFound("account");
        }
        long raw = dsl.select(ACCOUNT_BALANCES.BALANCE).from(ACCOUNT_BALANCES)
                .where(ACCOUNT_BALANCES.ACCOUNT_ID.eq(accountId)).fetchOne(ACCOUNT_BALANCES.BALANCE);
        return new AccountView(a.id(), a.code(), a.name(), a.type(), a.currency(), a.ownerUid(), a.allowNegative(),
                a.type().natural(raw), raw);
    }

    @Transactional(readOnly = true)
    public HouseholdView view(UUID householdId, String uid) {
        Member me = requireMember(householdId, uid);
        Record h = dsl.select(HOUSEHOLDS.fields()).from(HOUSEHOLDS).where(HOUSEHOLDS.ID.eq(householdId)).fetchOne();
        return toView(h, members(householdId), accounts(householdId, me));
    }

    @Transactional(readOnly = true)
    public List<HouseholdView> listMine(String uid) {
        return dsl.select(HOUSEHOLDS.fields()).from(HOUSEHOLDS)
                .join(HOUSEHOLD_MEMBERS).on(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID.eq(HOUSEHOLDS.ID))
                .where(HOUSEHOLD_MEMBERS.UID.eq(uid)).orderBy(HOUSEHOLDS.CREATED_AT)
                .fetch().stream()
                .map(h -> toView(h, List.of(), List.of()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<MemberView> members(UUID householdId) {
        return dsl.select(HOUSEHOLD_MEMBERS.UID, HOUSEHOLD_MEMBERS.ROLE, HOUSEHOLD_MEMBERS.DISPLAY_NAME)
                .from(HOUSEHOLD_MEMBERS).where(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID.eq(householdId))
                .orderBy(HOUSEHOLD_MEMBERS.CREATED_AT, HOUSEHOLD_MEMBERS.UID)
                .fetch(r -> new MemberView(r.value1(), Role.valueOf(r.value2()), r.value3()));
    }

    private static HouseholdView toView(Record h, List<MemberView> members, List<AccountView> accounts) {
        return new HouseholdView(h.get(HOUSEHOLDS.ID), h.get(HOUSEHOLDS.NAME), h.get(HOUSEHOLDS.CURRENCY),
                h.get(HOUSEHOLDS.APPROVAL_THRESHOLD), h.get(HOUSEHOLDS.APPROVAL_EXPIRY_HOURS),
                h.get(HOUSEHOLDS.CREATED_AT).toInstant(), members, accounts);
    }

    // ---- writes --------------------------------------------------------------------------------------------

    /** Creates the household, makes the caller its OWNER, and lays out the default account structure. */
    @Transactional
    public Outcome<HouseholdView> create(String uid, String idemKey, CreateHouseholdRequest req) {
        return create(uid, null, idemKey, req);
    }

    /** As above; {@code ownerDisplayName} (the token's name claim, when it has one) labels the owner and their pot. */
    @Transactional
    public Outcome<HouseholdView> create(String uid, String ownerDisplayName, String idemKey, CreateHouseholdRequest req) {
        String ownerName = ownerDisplayName == null || ownerDisplayName.isBlank()
                ? null
                : ownerDisplayName.strip().substring(0, Math.min(200, ownerDisplayName.strip().length()));
        return idempotency.execute("user:" + uid, idemKey, new Object[] {"create-household", uid, req}, HouseholdView.class, () -> {
            Money.zero(req.currency()); // validates the ISO code
            UUID id = UuidV7.next();
            OffsetDateTime now = now();
            dsl.insertInto(HOUSEHOLDS)
                    .set(HOUSEHOLDS.ID, id).set(HOUSEHOLDS.NAME, req.name()).set(HOUSEHOLDS.CURRENCY, req.currency())
                    .set(HOUSEHOLDS.APPROVAL_THRESHOLD, req.approvalThresholdMinor())
                    .set(HOUSEHOLDS.APPROVAL_EXPIRY_HOURS, req.approvalExpiryHours() == null ? 72 : req.approvalExpiryHours())
                    .set(HOUSEHOLDS.CREATED_BY_UID, uid).set(HOUSEHOLDS.CREATED_AT, now)
                    .execute();
            insertAccount(id, null, POOL, "Household pool", AccountType.ASSET, req.currency(), false, now);
            insertAccount(id, null, INCOME_DEPOSITS, "Deposits", AccountType.INCOME, req.currency(), false, now);
            insertAccount(id, null, EXPENSE_GENERAL, "General spending", AccountType.EXPENSE, req.currency(), false, now);
            insertMember(id, uid, Role.OWNER, ownerName, req.currency(), now);
            return new Result<>(HttpStatus.CREATED.value(), view(id, uid));
        });
    }

    @Transactional
    public HouseholdView updateSettings(UUID householdId, String uid, UpdateSettingsRequest req) {
        requireRole(householdId, uid, Role.OWNER);
        dsl.update(HOUSEHOLDS)
                .set(HOUSEHOLDS.APPROVAL_THRESHOLD, req.approvalThresholdMinor())
                .set(HOUSEHOLDS.APPROVAL_EXPIRY_HOURS, req.approvalExpiryHours())
                .where(HOUSEHOLDS.ID.eq(householdId)).execute();
        return view(householdId, uid);
    }

    @Transactional
    public MemberView addMember(UUID householdId, String uid, AddMemberRequest req) {
        requireRole(householdId, uid, Role.OWNER);
        HouseholdRow h = household(householdId);
        boolean exists = dsl.fetchExists(HOUSEHOLD_MEMBERS,
                HOUSEHOLD_MEMBERS.HOUSEHOLD_ID.eq(householdId).and(HOUSEHOLD_MEMBERS.UID.eq(req.uid())));
        if (exists) {
            throw ApiException.conflict("ALREADY_MEMBER", "user is already a member");
        }
        insertMember(householdId, req.uid(), req.role(), req.displayName(), h.currency(), now());
        return new MemberView(req.uid(), req.role(), req.displayName());
    }

    @Transactional
    public MemberView changeRole(UUID householdId, String uid, String targetUid, Role role) {
        requireRole(householdId, uid, Role.OWNER);
        Member target = requireMember(householdId, targetUid);
        if (target.role() == Role.OWNER && role != Role.OWNER) {
            long owners = dsl.fetchCount(HOUSEHOLD_MEMBERS,
                    HOUSEHOLD_MEMBERS.HOUSEHOLD_ID.eq(householdId).and(HOUSEHOLD_MEMBERS.ROLE.eq(Role.OWNER.name())));
            if (owners <= 1) {
                throw ApiException.conflict("LAST_OWNER", "a household needs at least one OWNER");
            }
        }
        dsl.update(HOUSEHOLD_MEMBERS).set(HOUSEHOLD_MEMBERS.ROLE, role.name())
                .where(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID.eq(householdId).and(HOUSEHOLD_MEMBERS.UID.eq(targetUid))).execute();
        return members(householdId).stream().filter(m -> m.uid().equals(targetUid)).findFirst().orElseThrow();
    }

    @Transactional
    public AccountView createAccount(UUID householdId, String uid, CreateAccountRequest req) {
        requireRole(householdId, uid, Role.OWNER, Role.APPROVER);
        HouseholdRow h = household(householdId);
        if (req.ownerUid() != null && !dsl.fetchExists(HOUSEHOLD_MEMBERS,
                HOUSEHOLD_MEMBERS.HOUSEHOLD_ID.eq(householdId).and(HOUSEHOLD_MEMBERS.UID.eq(req.ownerUid())))) {
            throw ApiException.badRequest("OWNER_NOT_MEMBER", "ownerUid is not a member of this household");
        }
        String currency = req.currency() == null ? h.currency() : req.currency();
        Money.zero(currency);
        UUID id = insertAccount(householdId, req.ownerUid(), req.code(), req.name(), req.type(), currency, Boolean.TRUE.equals(req.allowNegative()), now());
        return accountView(householdId, id, requireMember(householdId, uid));
    }

    // ---- invites -------------------------------------------------------------------------------------------

    public static final int DEFAULT_INVITE_HOURS = 168;
    public static final int MAX_INVITE_HOURS = 720;

    private static final SecureRandom RANDOM = new SecureRandom();

    /**
     * Owner creates a single-use invite code. The code is returned exactly once; only its SHA-256 is stored.
     * Joining with it gives the invitee the role and a pot of their own, so no one needs another person's member ID.
     */
    @Transactional
    public InviteCreated createInvite(UUID householdId, String uid, Role role, Integer ttlHours, String inviteeEmail) {
        requireRole(householdId, uid, Role.OWNER);
        int hours = ttlHours == null ? DEFAULT_INVITE_HOURS : ttlHours;
        if (hours < 1 || hours > MAX_INVITE_HOURS) {
            throw ApiException.badRequest("INVITE_TTL", "invite lifetime must be 1 to " + MAX_INVITE_HOURS + " hours");
        }
        byte[] raw = new byte[18];
        RANDOM.nextBytes(raw);
        String code = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        UUID id = UuidV7.next();
        OffsetDateTime now = now();
        OffsetDateTime expires = now.plusHours(hours);
        dsl.insertInto(HOUSEHOLD_INVITES)
                .set(HOUSEHOLD_INVITES.ID, id).set(HOUSEHOLD_INVITES.HOUSEHOLD_ID, householdId)
                .set(HOUSEHOLD_INVITES.CODE_HASH, sha256Hex(code)).set(HOUSEHOLD_INVITES.ROLE, role.name())
                .set(HOUSEHOLD_INVITES.CREATED_BY_UID, uid).set(HOUSEHOLD_INVITES.CREATED_AT, now)
                .set(HOUSEHOLD_INVITES.EXPIRES_AT, expires).execute();
        if (inviteeEmail != null && !inviteeEmail.isBlank()) {
            // Email only, in the same transaction as the invite. The code leaves the outbox once it has been sent.
            outbox.enqueue(Notification.toAddress(inviteeEmail.trim(), "HOUSEHOLD_INVITE", "family-treasury",
                    "You are invited to a household on My-Trove",
                    "You have been invited to join a household as " + role.name().toLowerCase(java.util.Locale.ROOT)
                            + ".\n\nYour invite code: " + code + "\nIt works once and expires " + expires.toInstant()
                            + ". Sign in to My-Trove and choose to join with a code.",
                    null, Notification.dedupeKey("household-invite", id.toString())));
        }
        return new InviteCreated(id, code, role, expires.toInstant());
    }

    /** Pending (unused, unexpired) invites of a household. Owners only: the list shows who was invited and when. */
    @Transactional(readOnly = true)
    public List<InviteView> pendingInvites(UUID householdId, String uid) {
        requireRole(householdId, uid, Role.OWNER);
        return dsl.selectFrom(HOUSEHOLD_INVITES)
                .where(HOUSEHOLD_INVITES.HOUSEHOLD_ID.eq(householdId)
                        .and(HOUSEHOLD_INVITES.USED_AT.isNull())
                        .and(HOUSEHOLD_INVITES.EXPIRES_AT.gt(now())))
                .orderBy(HOUSEHOLD_INVITES.CREATED_AT, HOUSEHOLD_INVITES.ID)
                .fetch(r -> new InviteView(r.get(HOUSEHOLD_INVITES.ID), Role.valueOf(r.get(HOUSEHOLD_INVITES.ROLE)),
                        r.get(HOUSEHOLD_INVITES.CREATED_BY_UID), r.get(HOUSEHOLD_INVITES.CREATED_AT).toInstant(),
                        r.get(HOUSEHOLD_INVITES.EXPIRES_AT).toInstant()));
    }

    @Transactional
    public void revokeInvite(UUID householdId, String uid, UUID inviteId) {
        requireRole(householdId, uid, Role.OWNER);
        int n = dsl.deleteFrom(HOUSEHOLD_INVITES)
                .where(HOUSEHOLD_INVITES.ID.eq(inviteId).and(HOUSEHOLD_INVITES.HOUSEHOLD_ID.eq(householdId))
                        .and(HOUSEHOLD_INVITES.USED_AT.isNull()))
                .execute();
        if (n == 0) {
            throw ApiException.notFound("invite");
        }
    }

    /**
     * Redeems a code. The single UPDATE ... WHERE used_at IS NULL AND expires_at > now is the atomic gate: of two
     * concurrent redemptions exactly one sees a row. If the redeemer is already a member the transaction rolls back,
     * so the code is NOT consumed.
     */
    @Transactional
    public HouseholdView acceptInvite(String uid, String displayName, String code) {
        OffsetDateTime now = now();
        var redeemed = dsl.update(HOUSEHOLD_INVITES)
                .set(HOUSEHOLD_INVITES.USED_AT, now).set(HOUSEHOLD_INVITES.USED_BY_UID, uid)
                .where(HOUSEHOLD_INVITES.CODE_HASH.eq(sha256Hex(code.trim()))
                        .and(HOUSEHOLD_INVITES.USED_AT.isNull())
                        .and(HOUSEHOLD_INVITES.EXPIRES_AT.gt(now)))
                .returning(HOUSEHOLD_INVITES.HOUSEHOLD_ID, HOUSEHOLD_INVITES.ROLE)
                .fetchOne();
        if (redeemed == null) {
            throw ApiException.badRequest("INVITE_INVALID", "This invite code is invalid, already used or expired");
        }
        UUID householdId = redeemed.get(HOUSEHOLD_INVITES.HOUSEHOLD_ID);
        Role role = Role.valueOf(redeemed.get(HOUSEHOLD_INVITES.ROLE));
        if (dsl.fetchExists(HOUSEHOLD_MEMBERS, HOUSEHOLD_MEMBERS.HOUSEHOLD_ID.eq(householdId).and(HOUSEHOLD_MEMBERS.UID.eq(uid)))) {
            throw ApiException.conflict("ALREADY_MEMBER", "You are already a member of this household");
        }
        HouseholdRow h = household(householdId);
        try {
            insertMember(householdId, uid, role, displayName, h.currency(), now);
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("ALREADY_MEMBER", "You are already a member of this household");
        }
        return view(householdId, uid);
    }

    private static String sha256Hex(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is required by every JVM", e);
        }
    }

    private void insertMember(UUID householdId, String uid, Role role, String displayName, String currency, OffsetDateTime now) {
        dsl.insertInto(HOUSEHOLD_MEMBERS)
                .set(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID, householdId).set(HOUSEHOLD_MEMBERS.UID, uid)
                .set(HOUSEHOLD_MEMBERS.ROLE, role.name()).set(HOUSEHOLD_MEMBERS.DISPLAY_NAME, displayName)
                .set(HOUSEHOLD_MEMBERS.CREATED_AT, now).execute();
        insertAccount(householdId, uid, "POT:" + uid, displayName == null ? "Pot of " + uid : displayName + " pot",
                AccountType.ASSET, currency, false, now);
    }

    private UUID insertAccount(UUID householdId, String ownerUid, String code, String name, AccountType type, String currency,
                               boolean allowNegative, OffsetDateTime now) {
        UUID id = UuidV7.next();
        try {
            dsl.insertInto(ACCOUNTS)
                    .set(ACCOUNTS.ID, id).set(ACCOUNTS.HOUSEHOLD_ID, householdId).set(ACCOUNTS.OWNER_UID, ownerUid)
                    .set(ACCOUNTS.CODE, code).set(ACCOUNTS.NAME, name).set(ACCOUNTS.TYPE, type.name())
                    .set(ACCOUNTS.CURRENCY, currency).set(ACCOUNTS.ALLOW_NEGATIVE, allowNegative).set(ACCOUNTS.CREATED_AT, now)
                    .execute();
        } catch (DuplicateKeyException e) {
            throw ApiException.conflict("ACCOUNT_CODE_TAKEN", "account code already exists: " + code);
        }
        dsl.insertInto(ACCOUNT_BALANCES)
                .set(ACCOUNT_BALANCES.ACCOUNT_ID, id).set(ACCOUNT_BALANCES.HOUSEHOLD_ID, householdId)
                .set(ACCOUNT_BALANCES.CURRENCY, currency).set(ACCOUNT_BALANCES.BALANCE, 0L)
                .set(ACCOUNT_BALANCES.VERSION, 0L).set(ACCOUNT_BALANCES.UPDATED_AT, now).execute();
        return id;
    }
}
