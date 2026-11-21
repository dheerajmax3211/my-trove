package com.personalplatform.shared.household;

import static com.personalplatform.sql.jooq.shared.shared.Tables.HOUSEHOLDS;
import static com.personalplatform.sql.jooq.shared.shared.Tables.HOUSEHOLD_INVITES;
import static com.personalplatform.sql.jooq.shared.shared.Tables.HOUSEHOLD_MEMBERS;

import com.personalplatform.shared.audit.AuditService;
import com.personalplatform.shared.common.ApiException;
import com.personalplatform.shared.common.Hashing;
import com.personalplatform.shared.common.Times;
import com.personalplatform.shared.file.FileService;
import com.personalplatform.sql.UuidV7;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.jooq.DSLContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HouseholdService {

    public static final Duration DEFAULT_INVITE_TTL = Duration.ofDays(7);
    public static final Duration MAX_INVITE_TTL = Duration.ofDays(30);

    public record HouseholdView(UUID id, String name, Role role, Instant createdAt) {}

    public record MemberView(String uid, Role role, Instant joinedAt) {}

    public record HouseholdDetail(UUID id, String name, Instant createdAt, Role callerRole, List<MemberView> members) {}

    /** {@code code} is returned exactly once, at creation; only its hash is stored. */
    public record InviteCreated(UUID id, String code, Role role, Instant expiresAt) {}

    public record InviteView(UUID id, Role role, String createdBy, Instant createdAt, Instant expiresAt) {}

    private static final SecureRandom RANDOM = new SecureRandom();

    private final DSLContext dsl;
    private final Clock clock;
    private final HouseholdAccess access;
    private final AuditService audit;
    private final FileService files;

    public HouseholdService(DSLContext dsl, Clock clock, HouseholdAccess access, AuditService audit,
            FileService files) {
        this.dsl = dsl;
        this.clock = clock;
        this.access = access;
        this.audit = audit;
        this.files = files;
    }

    @Transactional
    public HouseholdView create(String uid, String name) {
        Instant now = clock.instant();
        UUID id = UuidV7.next();
        dsl.insertInto(HOUSEHOLDS)
                .set(HOUSEHOLDS.ID, id)
                .set(HOUSEHOLDS.NAME, name.trim())
                .set(HOUSEHOLDS.CREATED_BY, uid)
                .set(HOUSEHOLDS.CREATED_AT, Times.odt(now))
                .execute();
        insertMember(id, uid, Role.OWNER, now);
        audit.record(uid, id, "household.created", "household", id.toString(), Map.of("name", name.trim()));
        return new HouseholdView(id, name.trim(), Role.OWNER, now);
    }

    @Transactional(readOnly = true)
    public List<HouseholdView> listMine(String uid) {
        return dsl.select(HOUSEHOLDS.ID, HOUSEHOLDS.NAME, HOUSEHOLD_MEMBERS.ROLE, HOUSEHOLDS.CREATED_AT)
                .from(HOUSEHOLD_MEMBERS)
                .join(HOUSEHOLDS).on(HOUSEHOLDS.ID.eq(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID))
                .where(HOUSEHOLD_MEMBERS.MEMBER_UID.eq(uid))
                .orderBy(HOUSEHOLDS.CREATED_AT, HOUSEHOLDS.ID)
                .fetch(r -> new HouseholdView(r.get(HOUSEHOLDS.ID), r.get(HOUSEHOLDS.NAME),
                        Role.valueOf(r.get(HOUSEHOLD_MEMBERS.ROLE)), Times.instant(r.get(HOUSEHOLDS.CREATED_AT))));
    }

    @Transactional(readOnly = true)
    public HouseholdDetail get(String uid, UUID householdId) {
        Membership m = access.requireMember(uid, householdId);
        var h = dsl.selectFrom(HOUSEHOLDS).where(HOUSEHOLDS.ID.eq(householdId)).fetchSingle();
        List<MemberView> members = dsl.selectFrom(HOUSEHOLD_MEMBERS)
                .where(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID.eq(householdId))
                .orderBy(HOUSEHOLD_MEMBERS.JOINED_AT, HOUSEHOLD_MEMBERS.MEMBER_UID)
                .fetch(r -> new MemberView(r.getMemberUid(), Role.valueOf(r.getRole()), Times.instant(r.getJoinedAt())));
        return new HouseholdDetail(h.getId(), h.getName(), Times.instant(h.getCreatedAt()), m.role(), members);
    }

    @Transactional
    public void delete(String uid, UUID householdId) {
        access.requireRole(uid, householdId, Role.OWNER);
        files.deleteAllForHousehold(householdId);
        dsl.deleteFrom(HOUSEHOLDS).where(HOUSEHOLDS.ID.eq(householdId)).execute();
        audit.record(uid, householdId, "household.deleted", "household", householdId.toString(), Map.of());
    }

    // ---- invites -------------------------------------------------------------------------------------------

    @Transactional
    public InviteCreated createInvite(String uid, UUID householdId, Role role, Duration ttl) {
        access.requireRole(uid, householdId, Role.OWNER);
        Duration effective = ttl == null ? DEFAULT_INVITE_TTL : ttl;
        if (effective.isNegative() || effective.isZero() || effective.compareTo(MAX_INVITE_TTL) > 0) {
            throw ApiException.badRequest("Invite lifetime must be positive and at most " + MAX_INVITE_TTL.toDays() + " days");
        }
        Instant now = clock.instant();
        Instant expires = now.plus(effective);
        byte[] raw = new byte[18];
        RANDOM.nextBytes(raw);
        String code = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        UUID id = UuidV7.next();
        Role granted = role == null ? Role.MEMBER : role;
        dsl.insertInto(HOUSEHOLD_INVITES)
                .set(HOUSEHOLD_INVITES.ID, id)
                .set(HOUSEHOLD_INVITES.HOUSEHOLD_ID, householdId)
                .set(HOUSEHOLD_INVITES.CODE_HASH, Hashing.sha256Hex(code))
                .set(HOUSEHOLD_INVITES.ROLE, granted.name())
                .set(HOUSEHOLD_INVITES.CREATED_BY, uid)
                .set(HOUSEHOLD_INVITES.CREATED_AT, Times.odt(now))
                .set(HOUSEHOLD_INVITES.EXPIRES_AT, Times.odt(expires))
                .execute();
        audit.record(uid, householdId, "invite.created", "invite", id.toString(),
                Map.of("role", granted.name(), "expiresAt", expires.toString()));
        return new InviteCreated(id, code, granted, expires);
    }

    @Transactional(readOnly = true)
    public List<InviteView> pendingInvites(String uid, UUID householdId) {
        access.requireRole(uid, householdId, Role.OWNER);
        Instant now = clock.instant();
        return dsl.selectFrom(HOUSEHOLD_INVITES)
                .where(HOUSEHOLD_INVITES.HOUSEHOLD_ID.eq(householdId)
                        .and(HOUSEHOLD_INVITES.USED_AT.isNull())
                        .and(HOUSEHOLD_INVITES.EXPIRES_AT.gt(Times.odt(now))))
                .orderBy(HOUSEHOLD_INVITES.CREATED_AT, HOUSEHOLD_INVITES.ID)
                .fetch(r -> new InviteView(r.getId(), Role.valueOf(r.getRole()), r.getCreatedBy(),
                        Times.instant(r.getCreatedAt()), Times.instant(r.getExpiresAt())));
    }

    @Transactional
    public void revokeInvite(String uid, UUID householdId, UUID inviteId) {
        access.requireRole(uid, householdId, Role.OWNER);
        int n = dsl.deleteFrom(HOUSEHOLD_INVITES)
                .where(HOUSEHOLD_INVITES.ID.eq(inviteId)
                        .and(HOUSEHOLD_INVITES.HOUSEHOLD_ID.eq(householdId))
                        .and(HOUSEHOLD_INVITES.USED_AT.isNull()))
                .execute();
        if (n == 0) {
            throw ApiException.notFound("Invite not found");
        }
        audit.record(uid, householdId, "invite.revoked", "invite", inviteId.toString(), Map.of());
    }

    /**
     * Redeems a code. The single UPDATE ... WHERE used_at IS NULL AND expires_at > now is the atomic gate:
     * of two concurrent redemptions exactly one sees a row. If the redeemer is already a member the
     * transaction rolls back, so the code is NOT consumed.
     */
    @Transactional
    public HouseholdView acceptInvite(String uid, String code) {
        Instant now = clock.instant();
        var redeemed = dsl.update(HOUSEHOLD_INVITES)
                .set(HOUSEHOLD_INVITES.USED_AT, Times.odt(now))
                .set(HOUSEHOLD_INVITES.USED_BY, uid)
                .where(HOUSEHOLD_INVITES.CODE_HASH.eq(Hashing.sha256Hex(code.trim()))
                        .and(HOUSEHOLD_INVITES.USED_AT.isNull())
                        .and(HOUSEHOLD_INVITES.EXPIRES_AT.gt(Times.odt(now))))
                .returning(HOUSEHOLD_INVITES.ID, HOUSEHOLD_INVITES.HOUSEHOLD_ID, HOUSEHOLD_INVITES.ROLE)
                .fetchOne();
        if (redeemed == null) {
            throw ApiException.gone("Invite code is invalid, already used or expired");
        }
        UUID householdId = redeemed.getHouseholdId();
        Role role = Role.valueOf(redeemed.getRole());
        if (!insertMemberIfAbsent(householdId, uid, role, now)) {
            throw ApiException.conflict("You are already a member of this household");
        }
        audit.record(uid, householdId, "member.joined", "member", uid,
                Map.of("role", role.name(), "inviteId", redeemed.getId().toString()));
        var h = dsl.selectFrom(HOUSEHOLDS).where(HOUSEHOLDS.ID.eq(householdId)).fetchSingle();
        return new HouseholdView(householdId, h.getName(), role, Times.instant(h.getCreatedAt()));
    }

    // ---- membership ----------------------------------------------------------------------------------------

    @Transactional
    public void leave(String uid, UUID householdId) {
        lockHousehold(householdId);
        Membership m = access.requireMember(uid, householdId);
        ensureNotLastOwner(householdId, uid, m.role());
        deleteMember(householdId, uid);
        audit.record(uid, householdId, "member.left", "member", uid, Map.of());
    }

    @Transactional
    public void removeMember(String actor, UUID householdId, String targetUid) {
        lockHousehold(householdId);
        access.requireRole(actor, householdId, Role.OWNER);
        Role targetRole = access.roleOf(targetUid, householdId)
                .orElseThrow(() -> ApiException.notFound("Member not found"));
        ensureNotLastOwner(householdId, targetUid, targetRole);
        deleteMember(householdId, targetUid);
        audit.record(actor, householdId, "member.removed", "member", targetUid, Map.of());
    }

    @Transactional
    public MemberView changeRole(String actor, UUID householdId, String targetUid, Role newRole) {
        lockHousehold(householdId);
        access.requireRole(actor, householdId, Role.OWNER);
        Role current = access.roleOf(targetUid, householdId)
                .orElseThrow(() -> ApiException.notFound("Member not found"));
        if (current != newRole) {
            if (newRole == Role.MEMBER) {
                ensureNotLastOwner(householdId, targetUid, current);
            }
            dsl.update(HOUSEHOLD_MEMBERS)
                    .set(HOUSEHOLD_MEMBERS.ROLE, newRole.name())
                    .where(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID.eq(householdId).and(HOUSEHOLD_MEMBERS.MEMBER_UID.eq(targetUid)))
                    .execute();
            audit.record(actor, householdId, "member.role_changed", "member", targetUid,
                    Map.of("from", current.name(), "to", newRole.name()));
        }
        var row = dsl.selectFrom(HOUSEHOLD_MEMBERS)
                .where(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID.eq(householdId).and(HOUSEHOLD_MEMBERS.MEMBER_UID.eq(targetUid)))
                .fetchSingle();
        return new MemberView(row.getMemberUid(), Role.valueOf(row.getRole()), Times.instant(row.getJoinedAt()));
    }

    // ---- helpers -------------------------------------------------------------------------------------------

    /** Serializes membership changes per household so the "last owner" check cannot race. */
    private void lockHousehold(UUID householdId) {
        dsl.select(HOUSEHOLDS.ID).from(HOUSEHOLDS).where(HOUSEHOLDS.ID.eq(householdId)).forUpdate().fetch();
    }

    private void ensureNotLastOwner(UUID householdId, String uid, Role role) {
        if (role != Role.OWNER) {
            return;
        }
        int otherOwners = dsl.fetchCount(HOUSEHOLD_MEMBERS,
                HOUSEHOLD_MEMBERS.HOUSEHOLD_ID.eq(householdId)
                        .and(HOUSEHOLD_MEMBERS.ROLE.eq(Role.OWNER.name()))
                        .and(HOUSEHOLD_MEMBERS.MEMBER_UID.ne(uid)));
        if (otherOwners == 0) {
            throw ApiException.conflict("The last owner cannot leave or be demoted; promote another owner or delete the household");
        }
    }

    private void insertMember(UUID householdId, String uid, Role role, Instant now) {
        dsl.insertInto(HOUSEHOLD_MEMBERS)
                .set(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID, householdId)
                .set(HOUSEHOLD_MEMBERS.MEMBER_UID, uid)
                .set(HOUSEHOLD_MEMBERS.ROLE, role.name())
                .set(HOUSEHOLD_MEMBERS.JOINED_AT, Times.odt(now))
                .execute();
    }

    private boolean insertMemberIfAbsent(UUID householdId, String uid, Role role, Instant now) {
        return dsl.insertInto(HOUSEHOLD_MEMBERS)
                .set(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID, householdId)
                .set(HOUSEHOLD_MEMBERS.MEMBER_UID, uid)
                .set(HOUSEHOLD_MEMBERS.ROLE, role.name())
                .set(HOUSEHOLD_MEMBERS.JOINED_AT, Times.odt(now))
                .onConflictDoNothing()
                .execute() == 1;
    }

    private void deleteMember(UUID householdId, String uid) {
        dsl.deleteFrom(HOUSEHOLD_MEMBERS)
                .where(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID.eq(householdId).and(HOUSEHOLD_MEMBERS.MEMBER_UID.eq(uid)))
                .execute();
    }
}
