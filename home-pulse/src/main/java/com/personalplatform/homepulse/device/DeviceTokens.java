package com.personalplatform.homepulse.device;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Per-device ingestion tokens: {@code hpd_} + 256 random bits (base64url). Only the SHA-256 hash is stored. A fast
 * hash is appropriate here (unlike passwords): the token is high-entropy machine-generated, not guessable.
 */
public final class DeviceTokens {

    public static final String PREFIX = "hpd_";
    private static final SecureRandom RANDOM = new SecureRandom();

    private DeviceTokens() {}

    public static String generate() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public static boolean looksLikeToken(String token) {
        return token != null && token.startsWith(PREFIX) && token.length() >= PREFIX.length() + 20 && token.length() <= 128;
    }

    public static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Short non-secret hint shown in listings so owners can tell tokens apart. */
    public static String displayPrefix(String token) {
        return token.substring(0, Math.min(token.length(), PREFIX.length() + 6));
    }
}
