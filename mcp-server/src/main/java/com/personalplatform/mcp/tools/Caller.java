package com.personalplatform.mcp.tools;

import com.personalplatform.security.PlatformProperties;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Set;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Who is calling, taken from the verified platform token the gateway forwarded.
 *
 * @param subject     {@code sub}: the Firebase uid of a person, or {@code app:<appId>} for an API key
 * @param type        USER for a person's platform token, API_KEY for a key's service token
 * @param permissions the token's {@code permissions[]}
 * @param token       the token itself, forwarded unchanged to the product services
 */
public record Caller(String subject, Type type, Set<String> permissions, String token) {

    public enum Type { USER, API_KEY }

    public Caller {
        permissions = Set.copyOf(permissions);
    }

    public static Caller from(Jwt jwt) {
        Type type = PlatformProperties.TOKEN_USE_SERVICE.equals(jwt.getClaimAsString("token_use")) ? Type.API_KEY : Type.USER;
        Set<String> permissions = new LinkedHashSet<>();
        if (jwt.getClaims().get("permissions") instanceof Collection<?> items) {
            for (Object item : items) {
                if (item instanceof String s && !s.isBlank()) {
                    permissions.add(s);
                }
            }
        }
        return new Caller(jwt.getSubject(), type, permissions, jwt.getTokenValue());
    }

    @Override
    public String toString() {
        return "Caller[" + type + " " + subject + "]";   // never the token
    }
}
