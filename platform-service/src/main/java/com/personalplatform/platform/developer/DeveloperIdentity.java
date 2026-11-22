package com.personalplatform.platform.developer;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;

/** Who the caller is for developer resources: the internal user id (uid claim) and the plan that limits them. */
public final class DeveloperIdentity {

    static final String DEFAULT_PLAN = "FREE";

    private DeveloperIdentity() {}

    /** The token's {@code uid}, the subject when a token has none. */
    public static String owner(Jwt jwt) {
        String uid = jwt.getClaimAsString("uid");
        String id = uid != null && !uid.isBlank() ? uid : jwt.getSubject();
        if (id == null || id.isBlank()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "The access token carries no user identity");
        }
        return id;
    }

    public static String plan(Jwt jwt) {
        String plan = jwt.getClaimAsString("plan");
        return plan == null || plan.isBlank() ? DEFAULT_PLAN : plan;
    }
}
