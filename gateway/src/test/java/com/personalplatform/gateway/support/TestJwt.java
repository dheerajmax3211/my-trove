package com.personalplatform.gateway.support;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import tools.jackson.databind.json.JsonMapper;

/** Mints RS256 platform-style tokens with a throwaway key. The gateway never verifies them; it only decodes. */
public final class TestJwt {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final KeyPair KEYS = generate();

    private TestJwt() {}

    private static KeyPair generate() {
        try {
            KeyPairGenerator g = KeyPairGenerator.getInstance("RSA");
            g.initialize(2048);
            return g.generateKeyPair();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public static String platformToken(String uid, String plan, List<String> permissions) {
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("iss", "http://localhost:8081");
        claims.put("aud", "trove-platform");
        claims.put("token_use", "platform");
        claims.put("sub", "firebase-" + uid);
        claims.put("uid", uid);
        claims.put("email", uid + "@example.test");
        claims.put("name", uid);
        claims.put("roles", List.of("MEMBER"));
        claims.put("permissions", permissions);
        claims.put("plan", plan);
        claims.put("workspaces", List.of());
        claims.put("pv", 1);
        claims.put("iat", Instant.now().getEpochSecond());
        claims.put("exp", Instant.now().getEpochSecond() + 600);
        return mint(claims);
    }

    public static String serviceToken(String appId, String plan) {
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("aud", "trove-platform");
        claims.put("token_use", "service");
        claims.put("sub", "app:" + appId);
        claims.put("scopes", List.of("data:read"));
        claims.put("plan", plan);
        claims.put("exp", Instant.now().getEpochSecond() + 600);
        return mint(claims);
    }

    public static String mint(Map<String, Object> claims) {
        try {
            Base64.Encoder enc = Base64.getUrlEncoder().withoutPadding();
            String header = enc.encodeToString(
                    JSON.writeValueAsString(Map.of("alg", "RS256", "typ", "JWT", "kid", "test-key"))
                            .getBytes(StandardCharsets.UTF_8));
            String payload = enc.encodeToString(JSON.writeValueAsString(claims).getBytes(StandardCharsets.UTF_8));
            Signature sig = Signature.getInstance("SHA256withRSA");
            sig.initSign(KEYS.getPrivate());
            sig.update((header + "." + payload).getBytes(StandardCharsets.UTF_8));
            return header + "." + payload + "." + enc.encodeToString(sig.sign());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> claims(String jwt) {
        String[] parts = jwt.split("\\.");
        return JSON.readValue(Base64.getUrlDecoder().decode(parts[1]), Map.class);
    }
}
