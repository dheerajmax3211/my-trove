package com.personalplatform.legacy.config;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/** Random bearer tokens and their stored digests. Only the digest is ever persisted. */
public final class Tokens {

    private static final SecureRandom RANDOM = new SecureRandom();

    private Tokens() {}

    /** 256 bits of randomness, base64url without padding (valid in an Authorization header). */
    public static String newToken() {
        byte[] b = new byte[32];
        RANDOM.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    public static byte[] sha256(byte[] data) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(data);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public static byte[] sha256(String text) {
        return sha256(text.getBytes(StandardCharsets.UTF_8));
    }

    public static String hex(byte[] bytes) {
        return HexFormat.of().formatHex(bytes);
    }
}
