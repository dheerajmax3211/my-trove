package com.personalplatform.auth.admin;

import com.personalplatform.auth.user.AuthUser;
import com.personalplatform.auth.user.UserRepository;
import com.personalplatform.auth.user.UserService;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/v1/admin/users")
public class AdminUserController {

    private final UserRepository users;
    private final UserService userService;

    public AdminUserController(UserRepository users, UserService userService) {
        this.users = users;
        this.userService = userService;
    }

    @GetMapping("/{id}")
    public AuthUser get(@PathVariable UUID id) {
        return users.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @PutMapping("/{id}/roles/{role}")
    @Transactional
    public AuthUser grant(@PathVariable UUID id, @PathVariable String role, @AuthenticationPrincipal Jwt jwt) {
        AuthUser actor = userService.resolve(jwt);
        requireUserAndRole(id, role);
        users.grantRole(id, role, actor.id());
        return users.findById(id).orElseThrow();
    }

    @DeleteMapping("/{id}/roles/{role}")
    @Transactional
    public AuthUser revoke(@PathVariable UUID id, @PathVariable String role, @AuthenticationPrincipal Jwt jwt) {
        AuthUser actor = userService.resolve(jwt);
        requireUserAndRole(id, role);
        if (UserService.ROLE_MEMBER.equals(role)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "MEMBER role cannot be revoked");
        }
        if (actor.id().equals(id) && (UserService.ROLE_ADMIN.equals(role) || UserService.ROLE_OWNER.equals(role))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Admins cannot revoke their own ADMIN or OWNER role");
        }
        users.revokeRole(id, role);
        return users.findById(id).orElseThrow();
    }

    private void requireUserAndRole(UUID id, String role) {
        if (users.findById(id).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found");
        }
        if (!users.roleExists(role)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown role");
        }
    }
}
