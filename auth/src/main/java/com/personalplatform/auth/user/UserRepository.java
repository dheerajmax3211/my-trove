package com.personalplatform.auth.user;

import static com.personalplatform.sql.jooq.auth.auth.Tables.ROLES;
import static com.personalplatform.sql.jooq.auth.auth.Tables.USERS;
import static com.personalplatform.sql.jooq.auth.auth.Tables.USER_ROLES;

import com.personalplatform.auth.rbac.RbacService;
import com.personalplatform.sql.UuidV7;
import com.personalplatform.sql.jooq.auth.auth.tables.records.UsersRecord;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.jooq.Condition;
import org.jooq.DSLContext;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {

    /** One page of users plus the total number of matches. */
    public record Page(List<AuthUser> items, long total) {}

    private final DSLContext dsl;
    private final RbacService rbac;

    public UserRepository(DSLContext dsl, RbacService rbac) {
        this.dsl = dsl;
        this.rbac = rbac;
    }

    /** Inserts the user if the Firebase uid is new; returns the stored row either way. */
    public UUID upsertByFirebaseUid(String firebaseUid, String email, String displayName) {
        return dsl.insertInto(USERS)
                .set(USERS.ID, UuidV7.next())
                .set(USERS.FIREBASE_UID, firebaseUid)
                .set(USERS.EMAIL, email)
                .set(USERS.DISPLAY_NAME, displayName)
                .onConflict(USERS.FIREBASE_UID)
                .doUpdate()
                .set(USERS.EMAIL, email)
                .set(USERS.DISPLAY_NAME, displayName)
                .returning(USERS.ID)
                .fetchOne(USERS.ID);
    }

    public void touchLastLogin(UUID userId) {
        dsl.update(USERS).set(USERS.LAST_LOGIN_AT, OffsetDateTime.now()).where(USERS.ID.eq(userId)).execute();
    }

    public Optional<AuthUser> findById(UUID id) {
        return dsl.selectFrom(USERS).where(USERS.ID.eq(id)).fetchOptional().map(u -> toUsers(List.of(u)).get(0));
    }

    public Optional<AuthUser> findByFirebaseUid(String firebaseUid) {
        return dsl.selectFrom(USERS)
                .where(USERS.FIREBASE_UID.eq(firebaseUid))
                .fetchOptional()
                .map(u -> toUsers(List.of(u)).get(0));
    }

    /** Newest first. {@code q} matches email or display name, case-insensitively, as plain text (no wildcards). */
    public Page search(String q, int page, int size) {
        Condition where = DSL.trueCondition();
        if (q != null && !q.isBlank()) {
            String needle = q.trim();
            where = USERS.EMAIL.containsIgnoreCase(needle).or(USERS.DISPLAY_NAME.containsIgnoreCase(needle));
        }
        long total = dsl.fetchCount(USERS, where);
        List<UsersRecord> rows = dsl.selectFrom(USERS)
                .where(where)
                .orderBy(USERS.CREATED_AT.desc(), USERS.ID.desc())
                .limit(size)
                .offset((long) page * size)
                .fetch();
        return new Page(toUsers(rows), total);
    }

    /** The public face of a user: no roles, no Firebase uid. */
    public record Identity(UUID id, String email, String displayName) {}

    /** Ids that exist, as {@link Identity}; unknown ids are simply absent. Order is not guaranteed. */
    public List<Identity> findIdentities(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return dsl.select(USERS.ID, USERS.EMAIL, USERS.DISPLAY_NAME)
                .from(USERS)
                .where(USERS.ID.in(ids))
                .fetch(r -> new Identity(r.value1(), r.value2(), r.value3()));
    }

    private List<AuthUser> toUsers(List<UsersRecord> rows) {
        Map<UUID, Set<String>> rolesByUser = new HashMap<>();
        if (!rows.isEmpty()) {
            Collection<UUID> ids = rows.stream().map(UsersRecord::getId).toList();
            dsl.select(USER_ROLES.USER_ID, USER_ROLES.ROLE_NAME)
                    .from(USER_ROLES)
                    .where(USER_ROLES.USER_ID.in(ids))
                    .fetch()
                    .forEach(r -> rolesByUser.computeIfAbsent(r.value1(), k -> new HashSet<>()).add(r.value2()));
        }
        return rows.stream()
                .map(u -> {
                    Set<String> roles = Set.copyOf(rolesByUser.getOrDefault(u.getId(), Set.of()));
                    return new AuthUser(
                            u.getId(),
                            u.getFirebaseUid(),
                            u.getEmail(),
                            u.getDisplayName(),
                            roles,
                            rbac.permissionsFor(roles),
                            u.getPlan(),
                            u.getSuspendedAt() != null,
                            u.getPermissionsVersion());
                })
                .toList();
    }

    public boolean roleExists(String role) {
        return dsl.fetchExists(ROLES, ROLES.NAME.eq(role));
    }

    /** @return true if the grant was new. */
    public boolean grantRole(UUID userId, String role, UUID grantedBy) {
        return dsl.insertInto(USER_ROLES)
                .set(USER_ROLES.USER_ID, userId)
                .set(USER_ROLES.ROLE_NAME, role)
                .set(USER_ROLES.GRANTED_BY, grantedBy)
                .onConflictDoNothing()
                .execute() > 0;
    }

    /** @return true if the user held the role. */
    public boolean revokeRole(UUID userId, String role) {
        return dsl.deleteFrom(USER_ROLES)
                .where(USER_ROLES.USER_ID.eq(userId).and(USER_ROLES.ROLE_NAME.eq(role)))
                .execute() > 0;
    }

    public Set<String> allRoleNames() {
        return dsl.select(ROLES.NAME).from(ROLES).fetch().stream().map(r -> r.get(ROLES.NAME)).collect(Collectors.toSet());
    }

    /** Invalidates cached platform tokens issued before this change (they carry the old {@code pv}). */
    public void bumpPermissionsVersion(UUID userId) {
        dsl.update(USERS)
                .set(USERS.PERMISSIONS_VERSION, USERS.PERMISSIONS_VERSION.plus(1))
                .where(USERS.ID.eq(userId))
                .execute();
    }

    /** @return true if the suspension state changed. */
    public boolean setSuspended(UUID userId, boolean suspended) {
        return dsl.update(USERS)
                .set(USERS.SUSPENDED_AT, suspended ? OffsetDateTime.now() : null)
                .where(USERS.ID.eq(userId))
                .and(suspended ? USERS.SUSPENDED_AT.isNull() : USERS.SUSPENDED_AT.isNotNull())
                .execute() > 0;
    }

    public void setPlan(UUID userId, String plan) {
        dsl.update(USERS).set(USERS.PLAN, plan).where(USERS.ID.eq(userId)).execute();
    }

    /** Number of OWNERs that can still act: hold OWNER, are not suspended and are not {@code excluded}. */
    public int countActiveOwnersExcluding(UUID excluded) {
        return dsl.fetchCount(
                dsl.select(USER_ROLES.USER_ID)
                        .from(USER_ROLES)
                        .join(USERS).on(USERS.ID.eq(USER_ROLES.USER_ID))
                        .where(USER_ROLES.ROLE_NAME.eq("OWNER"))
                        .and(USERS.SUSPENDED_AT.isNull())
                        .and(USER_ROLES.USER_ID.ne(excluded)));
    }

    /** Serialises changes that can remove an OWNER, so two concurrent requests cannot both leave zero owners. */
    public void lockOwnerChanges() {
        dsl.fetch("select cast(pg_advisory_xact_lock(?) as text)", 7_315_002L);
    }
}
