package com.personalplatform.auth.user;

import com.personalplatform.auth.config.AppProperties;
import java.util.Locale;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    public static final String ROLE_USER = "USER";
    public static final String ROLE_ADMIN = "ADMIN";

    private final UserRepository users;
    private final AppProperties props;

    public UserService(UserRepository users, AppProperties props) {
        this.users = users;
        this.props = props;
    }

    /** Creates the local user on first sight of a Firebase uid and ensures baseline roles. */
    @Transactional
    public AuthUser provision(Jwt jwt) {
        String email = jwt.getClaimAsString("email");
        String name = jwt.getClaimAsString("name");
        UUID id = users.upsertByFirebaseUid(jwt.getSubject(), email, name);
        users.grantRole(id, ROLE_USER, null);
        if (shouldBootstrapAdmin(jwt, email)) {
            users.grantRole(id, ROLE_ADMIN, null);
        }
        return users.findById(id).orElseThrow();
    }

    /** Read-mostly path for per-request auth: only writes when the user is new. */
    @Transactional
    public AuthUser resolve(Jwt jwt) {
        return users.findByFirebaseUid(jwt.getSubject()).orElseGet(() -> provision(jwt));
    }

    @Transactional
    public AuthUser recordLogin(Jwt jwt) {
        AuthUser user = provision(jwt);
        users.touchLastLogin(user.id());
        return user;
    }

    private boolean shouldBootstrapAdmin(Jwt jwt, String email) {
        if (email == null || !Boolean.TRUE.equals(jwt.getClaimAsBoolean("email_verified"))) {
            return false;
        }
        String normalized = email.toLowerCase(Locale.ROOT);
        return props.auth().bootstrapAdminEmails().stream()
                .anyMatch(e -> e.trim().toLowerCase(Locale.ROOT).equals(normalized));
    }
}
