package com.personalplatform.platform.developer;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Random credentials and their digests. Anything a developer is shown once (client secrets, API keys) is generated
 * here; the database only ever receives {@link #sha256Hex(String)} of it.
 */
final class Secrets {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder URL_ENCODER = Base64.getUrlEncoder().withoutPadding();

    private Secrets() {}

    /** {@code bytes} random bytes, lower-case hex. */
    static String randomHex(int bytes) {
        byte[] b = new byte[bytes];
        RANDOM.nextBytes(b);
        return HexFormat.of().formatHex(b);
    }

    /** {@code bytes} random bytes, URL-safe base64 without padding. */
    static String randomUrlSafe(int bytes) {
        byte[] b = new byte[bytes];
        RANDOM.nextBytes(b);
        return URL_ENCODER.encodeToString(b);
    }

    /** SHA-256 of the UTF-8 bytes, lower-case hex (64 characters). */
    static String sha256Hex(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
