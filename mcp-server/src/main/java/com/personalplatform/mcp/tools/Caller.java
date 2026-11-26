package com.personalplatform.mcp.tools;

import com.personalplatform.security.PlatformProperties;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Who is calling, taken from the verified platform token the gateway forwarded.
 *
 * @param subject     {@code sub}: the Firebase uid of a person, or {@code app:<appId>} for an API key
 * @param type        USER for a person's platform token, API_KEY for a key's service token
 * @param permissions the token's {@code permissions[]}
 * @param token       the token itself: forwarded unchanged to the product services for a person; for an API key it is
 *                    only ever sent to auth to be exchanged for a delegated token for the owner
 * @param onBehalfOf  for an API key, the internal user id of the person it acts for ({@code act.sub}, else
 *                    {@code owner_uid}); null for a person
 */
public record Caller(String subject, Type type, Set<String> permissions, String token, String onBehalfOf) {

    public enum Type { USER, API_KEY }

    public Caller {
        permissions = Set.copyOf(permissions);
    }

    public Caller(String subject, Type type, Set<String> permissions, String token) {
        this(subject, type, permissions, token, null);
    }

    public static Caller from(Jwt jwt) {
        Type type = PlatformProperties.TOKEN_USE_SERVICE.equals(jwt.getClaimAsString("token_use")) ? Type.API_KEY : Type.USER;
        String onBehalfOf = null;
        if (type == Type.API_KEY) {
            if (jwt.getClaims().get("act") instanceof Map<?, ?> act && act.get("sub") instanceof String s && !s.isBlank()) {
                onBehalfOf = s;
            } else {
                onBehalfOf = jwt.getClaimAsString("owner_uid");
            }
        }
        return new Caller(jwt.getSubject(), type, permissionsOf(jwt), jwt.getTokenValue(), onBehalfOf);
    }

    public static Set<String> permissionsOf(Jwt jwt) {
        Set<String> permissions = new LinkedHashSet<>();
        if (jwt.getClaims().get("permissions") instanceof Collection<?> items) {
            for (Object item : items) {
                if (item instanceof String s && !s.isBlank()) {
                    permissions.add(s);
                }
            }
        }
        return permissions;
    }

    @Override
    public String toString() {
        return "Caller[" + type + " " + subject + (onBehalfOf == null ? "" : " for " + onBehalfOf) + "]";   // never the token
    }
}
