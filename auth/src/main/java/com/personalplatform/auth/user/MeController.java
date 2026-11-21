package com.personalplatform.auth.user;

import java.util.Set;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
public class MeController {

    public record Profile(
            UUID id, String email, String displayName, Set<String> roles, Set<String> permissions, String plan) {
        static Profile of(AuthUser u) {
            return new Profile(u.id(), u.email(), u.displayName(), u.roles(), u.permissions(), u.plan());
        }
    }

    private final UserService users;

    public MeController(UserService users) {
        this.users = users;
    }

    /** Current user's profile and roles (provisioned on first call). */
    @GetMapping("/me")
    public Profile me(@AuthenticationPrincipal Jwt jwt) {
        return Profile.of(users.provision(jwt));
    }

    /** Call once after Firebase sign-in: provisions the user and records the login. */
    @PostMapping("/auth/session")
    public Profile session(@AuthenticationPrincipal Jwt jwt) {
        return Profile.of(users.recordLogin(jwt));
    }
}
