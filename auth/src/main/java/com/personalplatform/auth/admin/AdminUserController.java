package com.personalplatform.auth.admin;

import com.personalplatform.auth.common.ApiException;
import com.personalplatform.auth.user.AuthUser;
import com.personalplatform.auth.user.UserRepository;
import com.personalplatform.auth.user.UserService;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * User administration. Each handler declares the permission it needs (deny by default); the guardrails that depend on
 * who is acting on whom (privileged roles, last OWNER) live in {@link AdminService}.
 */
@RestController
@RequestMapping("/v1/admin/users")
public class AdminUserController {

    /** What an administrator may see of a user (the Firebase uid stays internal). */
    public record UserView(
            UUID id,
            String email,
            String displayName,
            Set<String> roles,
            Set<String> permissions,
            String plan,
            boolean suspended,
            int permissionsVersion) {
        static UserView of(AuthUser u) {
            return new UserView(
                    u.id(), u.email(), u.displayName(), u.roles(), u.permissions(), u.plan(), u.suspended(),
                    u.permissionsVersion());
        }
    }

    private final UserRepository users;
    private final UserService userService;
    private final AdminService admin;

    public AdminUserController(UserRepository users, UserService userService, AdminService admin) {
        this.users = users;
        this.userService = userService;
        this.admin = admin;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('users:read')")
    public PageResponse<UserView> list(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Paging.validate(page, size);
        UserRepository.Page result = users.search(q, page, size);
        List<UserView> items = result.items().stream().map(UserView::of).toList();
        return new PageResponse<>(items, page, size, result.total());
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('users:read')")
    public UserView get(@PathVariable UUID id) {
        return UserView.of(users.findById(id).orElseThrow(() -> ApiException.notFound("User")));
    }

    @PutMapping("/{id}/roles/{role}")
    @PreAuthorize("hasAuthority('roles:assign')")
    public UserView grant(@PathVariable UUID id, @PathVariable String role, @AuthenticationPrincipal Jwt jwt) {
        return UserView.of(admin.grantRole(userService.resolve(jwt), id, role));
    }

    @DeleteMapping("/{id}/roles/{role}")
    @PreAuthorize("hasAuthority('roles:assign')")
    public UserView revoke(@PathVariable UUID id, @PathVariable String role, @AuthenticationPrincipal Jwt jwt) {
        return UserView.of(admin.revokeRole(userService.resolve(jwt), id, role));
    }

    @PostMapping("/{id}/suspend")
    @PreAuthorize("hasAuthority('users:write')")
    public UserView suspend(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return UserView.of(admin.suspend(userService.resolve(jwt), id));
    }

    @PostMapping("/{id}/restore")
    @PreAuthorize("hasAuthority('users:write')")
    public UserView restore(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        return UserView.of(admin.restore(userService.resolve(jwt), id));
    }

    @PutMapping("/{id}/plan/{plan}")
    @PreAuthorize("hasAuthority('plans:manage')")
    public UserView changePlan(@PathVariable UUID id, @PathVariable String plan, @AuthenticationPrincipal Jwt jwt) {
        return UserView.of(admin.changePlan(userService.resolve(jwt), id, plan));
    }
}
