package com.personalplatform.gateway.security;

import java.util.Set;

/**
 * The caller as far as the gateway knows it. {@code principalId} is null for anonymous and passthrough callers: the
 * gateway never saw a credential it understands, so those are identified by client address only.
 */
public record CallerIdentity(PrincipalType type, String principalId, String appId, String plan, Set<String> permissions) {

    public CallerIdentity {
        permissions = permissions == null ? Set.of() : Set.copyOf(permissions);
    }

    public static CallerIdentity anonymous(PrincipalType type) {
        return new CallerIdentity(type, null, null, "FREE", Set.of());
    }

    /** True when a platform token was issued for this caller. */
    public boolean authenticated() {
        return principalId != null;
    }
}
