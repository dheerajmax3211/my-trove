package com.personalplatform.gateway.security;

import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.Set;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The few claims the gateway reads from a platform token it has just received from {@code auth}. The signature is
 * deliberately not checked here: the token came straight from the exchange over the internal network, and every
 * downstream service verifies it against the JWKS before trusting it.
 */
public record TokenClaims(String subject, String uid, String plan, String tokenUse, Set<String> permissions,
        Instant expiresAt) {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    public static TokenClaims parse(String jwt) {
        try {
            String[] parts = jwt.split("\\.");
            if (parts.length < 2) {
                throw new IllegalArgumentException("not a JWT");
            }
            JsonNode payload = JSON.readTree(Base64.getUrlDecoder().decode(parts[1]));
            Set<String> permissions = new LinkedHashSet<>();
            JsonNode perms = payload.path("permissions");
            if (perms.isArray()) {
                perms.forEach(p -> permissions.add(p.asString()));
            }
            JsonNode exp = payload.path("exp");
            return new TokenClaims(text(payload, "sub"), text(payload, "uid"), text(payload, "plan"),
                    text(payload, "token_use"), permissions, exp.isNumber() ? Instant.ofEpochSecond(exp.asLong()) : null);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("unreadable platform token", e);
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isString() && !v.asString().isBlank() ? v.asString() : null;
    }

    public boolean isService() {
        return "service".equals(tokenUse);
    }

    /** Identity for metering and limiting; null when the token names no principal at all. */
    public CallerIdentity toIdentity() {
        String effectivePlan = plan == null ? "FREE" : plan;
        if (isService()) {
            if (subject == null) {
                return null;
            }
            String appId = subject.startsWith("app:") ? subject.substring("app:".length()) : subject;
            return new CallerIdentity(PrincipalType.API_KEY, subject, appId, effectivePlan, permissions);
        }
        String id = uid != null ? uid : subject;
        return id == null ? null : new CallerIdentity(PrincipalType.USER, id, null, effectivePlan, permissions);
    }
}
