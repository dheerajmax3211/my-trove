package com.personalplatform.shared.household;

import static com.personalplatform.sql.jooq.shared.shared.Tables.HOUSEHOLD_MEMBERS;

import com.personalplatform.shared.common.ApiException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.jooq.DSLContext;
import org.springframework.stereotype.Service;

/**
 * The reusable authorization check: "is caller a member of household X (with at least role Y)?".
 * <ul>
 *   <li>Not a member (or household unknown) -> 404, so household ids cannot be probed.</li>
 *   <li>Member without enough privilege -> 403.</li>
 * </ul>
 * Other services mirror this rule (see README): query {@code shared.household_members} or call
 * {@code GET /v1/households/{id}/membership} with the caller's own token.
 */
@Service
public class HouseholdAccess {

    private final DSLContext dsl;

    public HouseholdAccess(DSLContext dsl) {
        this.dsl = dsl;
    }

    public Optional<Role> roleOf(String uid, UUID householdId) {
        return dsl.select(HOUSEHOLD_MEMBERS.ROLE)
                .from(HOUSEHOLD_MEMBERS)
                .where(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID.eq(householdId).and(HOUSEHOLD_MEMBERS.MEMBER_UID.eq(uid)))
                .fetchOptional(HOUSEHOLD_MEMBERS.ROLE)
                .map(Role::valueOf);
    }

    public boolean isMember(String uid, UUID householdId) {
        return roleOf(uid, householdId).isPresent();
    }

    public Membership requireMember(String uid, UUID householdId) {
        Role role = roleOf(uid, householdId).orElseThrow(() -> ApiException.notFound("Household not found"));
        return new Membership(householdId, uid, role);
    }

    public Membership requireRole(String uid, UUID householdId, Role required) {
        Membership m = requireMember(uid, householdId);
        if (!m.role().atLeast(required)) {
            throw ApiException.forbidden("Requires household role " + required);
        }
        return m;
    }

    public List<UUID> householdIdsOf(String uid) {
        return dsl.select(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID)
                .from(HOUSEHOLD_MEMBERS)
                .where(HOUSEHOLD_MEMBERS.MEMBER_UID.eq(uid))
                .fetch(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID);
    }

    public List<String> memberUids(UUID householdId) {
        return dsl.select(HOUSEHOLD_MEMBERS.MEMBER_UID)
                .from(HOUSEHOLD_MEMBERS)
                .where(HOUSEHOLD_MEMBERS.HOUSEHOLD_ID.eq(householdId))
                .orderBy(HOUSEHOLD_MEMBERS.MEMBER_UID)
                .fetch(HOUSEHOLD_MEMBERS.MEMBER_UID);
    }
}
