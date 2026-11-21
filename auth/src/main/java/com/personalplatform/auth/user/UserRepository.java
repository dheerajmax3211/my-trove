package com.personalplatform.auth.user;

import static com.personalplatform.sql.jooq.auth.auth.Tables.ROLES;
import static com.personalplatform.sql.jooq.auth.auth.Tables.USERS;
import static com.personalplatform.sql.jooq.auth.auth.Tables.USER_ROLES;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import com.personalplatform.sql.UuidV7;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {

    private final DSLContext dsl;

    public UserRepository(DSLContext dsl) {
        this.dsl = dsl;
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
        return dsl.selectFrom(USERS).where(USERS.ID.eq(id)).fetchOptional().map(this::withRoles);
    }

    public Optional<AuthUser> findByFirebaseUid(String firebaseUid) {
        return dsl.selectFrom(USERS).where(USERS.FIREBASE_UID.eq(firebaseUid)).fetchOptional().map(this::withRoles);
    }

    private AuthUser withRoles(com.personalplatform.sql.jooq.auth.auth.tables.records.UsersRecord u) {
        Set<String> roles = dsl.select(USER_ROLES.ROLE_NAME)
                .from(USER_ROLES)
                .where(USER_ROLES.USER_ID.eq(u.getId()))
                .fetchSet(USER_ROLES.ROLE_NAME);
        return new AuthUser(u.getId(), u.getFirebaseUid(), u.getEmail(), u.getDisplayName(), roles);
    }

    public boolean roleExists(String role) {
        return dsl.fetchExists(ROLES, ROLES.NAME.eq(role));
    }

    public void grantRole(UUID userId, String role, UUID grantedBy) {
        dsl.insertInto(USER_ROLES)
                .set(USER_ROLES.USER_ID, userId)
                .set(USER_ROLES.ROLE_NAME, role)
                .set(USER_ROLES.GRANTED_BY, grantedBy)
                .onConflictDoNothing()
                .execute();
    }

    public void revokeRole(UUID userId, String role) {
        dsl.deleteFrom(USER_ROLES)
                .where(USER_ROLES.USER_ID.eq(userId).and(USER_ROLES.ROLE_NAME.eq(role)))
                .execute();
    }

    public Set<String> allRoleNames() {
        return dsl.select(ROLES.NAME).from(ROLES).fetch().stream().map(r -> r.get(ROLES.NAME)).collect(Collectors.toSet());
    }
}
