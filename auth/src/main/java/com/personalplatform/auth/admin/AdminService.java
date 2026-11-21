package com.personalplatform.auth.admin;

import com.personalplatform.auth.common.ApiException;
import com.personalplatform.auth.rbac.Permission;
import com.personalplatform.auth.rbac.Persona;
import com.personalplatform.auth.user.AuthUser;
import com.personalplatform.auth.user.UserRepository;
import com.personalplatform.auth.user.UserService;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Every mutation of roles, suspension and plans goes through here: the guardrails (privileged roles, last OWNER), the
 * permissions-version bump and the audit row are applied in one transaction, so none of them can be skipped.
 * Callers have already passed the coarse {@code @PreAuthorize} check on the endpoint.
 */
@Service
public class AdminService {

    public static final Set<String> PLANS = Set.of("FREE", "PRO", "DEVELOPER");

    private final UserRepository users;
    private final AuditRepository audit;

    public AdminService(UserRepository users, AuditRepository audit) {
        this.users = users;
        this.audit = audit;
    }

    @Transactional
    public AuthUser grantRole(AuthUser actor, UUID targetId, String role) {
        AuthUser target = requireTarget(targetId);
        requireRole(role);
        requirePrivilegeIfNeeded(actor, target, role);
        if (users.grantRole(targetId, role, actor.id())) {
            users.bumpPermissionsVersion(targetId);
            audit.record(actor.id(), AuditRepository.ROLE_GRANTED, targetId, Map.of("role", role));
        }
        return users.findById(targetId).orElseThrow();
    }

    @Transactional
    public AuthUser revokeRole(AuthUser actor, UUID targetId, String role) {
        users.lockOwnerChanges();
        AuthUser target = requireTarget(targetId);
        requireRole(role);
        if (UserService.ROLE_MEMBER.equals(role)) {
            throw ApiException.badRequest("BASELINE_ROLE", "The MEMBER role is held by everyone and cannot be revoked");
        }
        requirePrivilegeIfNeeded(actor, target, role);
        if (UserService.ROLE_OWNER.equals(role) && target.roles().contains(UserService.ROLE_OWNER)) {
            requireAnotherActiveOwner(target);
        }
        if (users.revokeRole(targetId, role)) {
            users.bumpPermissionsVersion(targetId);
            audit.record(actor.id(), AuditRepository.ROLE_REVOKED, targetId, Map.of("role", role));
        }
        return users.findById(targetId).orElseThrow();
    }

    @Transactional
    public AuthUser suspend(AuthUser actor, UUID targetId) {
        users.lockOwnerChanges();
        AuthUser target = requireTarget(targetId);
        requirePrivilegeIfNeeded(actor, target, null);
        if (target.roles().contains(UserService.ROLE_OWNER) && !target.suspended()) {
            requireAnotherActiveOwner(target);
        }
        if (target.id().equals(actor.id())) {
            throw ApiException.badRequest("SELF_SUSPEND", "You cannot suspend your own account");
        }
        if (users.setSuspended(targetId, true)) {
            users.bumpPermissionsVersion(targetId);
            audit.record(actor.id(), AuditRepository.USER_SUSPENDED, targetId, Map.of());
        }
        return users.findById(targetId).orElseThrow();
    }

    @Transactional
    public AuthUser restore(AuthUser actor, UUID targetId) {
        AuthUser target = requireTarget(targetId);
        requirePrivilegeIfNeeded(actor, target, null);
        if (users.setSuspended(targetId, false)) {
            users.bumpPermissionsVersion(targetId);
            audit.record(actor.id(), AuditRepository.USER_RESTORED, targetId, Map.of());
        }
        return users.findById(targetId).orElseThrow();
    }

    @Transactional
    public AuthUser changePlan(AuthUser actor, UUID targetId, String plan) {
        AuthUser target = requireTarget(targetId);
        if (!PLANS.contains(plan)) {
            throw ApiException.badRequest("INVALID_PLAN", "Plan must be one of FREE, PRO, DEVELOPER");
        }
        if (!plan.equals(target.plan())) {
            users.setPlan(targetId, plan);
            users.bumpPermissionsVersion(targetId);
            audit.record(actor.id(), AuditRepository.PLAN_CHANGED, targetId, Map.of("from", target.plan(), "to", plan));
        }
        return users.findById(targetId).orElseThrow();
    }

    private AuthUser requireTarget(UUID id) {
        return users.findById(id).orElseThrow(() -> ApiException.notFound("User"));
    }

    private void requireRole(String role) {
        if (!users.roleExists(role)) {
            throw ApiException.notFound("Role");
        }
    }

    /**
     * ADMIN and OWNER can be granted, revoked or touched only with {@code roles:assign:privileged} (held by OWNER). This
     * covers both the role being changed ({@code role}, may be null) and the target already holding one.
     */
    private void requirePrivilegeIfNeeded(AuthUser actor, AuthUser target, String role) {
        boolean privilegedChange = role != null && Persona.isPrivileged(role);
        boolean privilegedTarget = target.roles().stream().anyMatch(Persona::isPrivileged);
        if ((privilegedChange || privilegedTarget)
                && !actor.permissions().contains(Permission.ROLES_ASSIGN_PRIVILEGED.value())) {
            throw ApiException.forbidden(
                    "PRIVILEGED_ROLE_REQUIRED", "Only an OWNER can grant or revoke ADMIN or OWNER, or change an ADMIN or OWNER");
        }
    }

    /** The platform must always keep one OWNER that can act (holds OWNER and is not suspended). */
    private void requireAnotherActiveOwner(AuthUser target) {
        if (!target.suspended() && users.countActiveOwnersExcluding(target.id()) == 0) {
            throw ApiException.conflict("LAST_OWNER", "The last active OWNER cannot be removed or suspended");
        }
    }
}
