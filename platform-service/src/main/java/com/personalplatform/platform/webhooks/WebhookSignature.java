package com.personalplatform.platform.webhooks;

import com.personalplatform.sql.UuidV7;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * HMAC-SHA256 signatures on deliveries. The header is {@code t=<unix seconds>,v1=<hex>} where the digest covers
 * {@code <t>.<body>}; a receiver recomputes it with the endpoint secret and refuses timestamps outside a tolerance, so a
 * captured delivery cannot be replayed later.
 */
public final class WebhookSignature {

    public static final String HEADER = "X-Trove-Signature";
    public static final String SECRET_PREFIX = "whsec_";

    private static final SecureRandom RANDOM = new SecureRandom();

    private WebhookSignature() {}

    /** A fresh endpoint secret: prefix plus 32 random bytes, URL-safe base64. */
    public static String newSecret() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return SECRET_PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** The header value for a delivery made at {@code timestamp} with this body. */
    public static String sign(String secret, long timestamp, String body) {
        return "t=" + timestamp + ",v1=" + HexFormat.of().formatHex(digest(secret, timestamp, body));
    }

    /**
     * True when the header matches the secret and body and its timestamp is within {@code toleranceSeconds} of
     * {@code now} in either direction. Malformed input is false, never an exception.
     */
    public static boolean verify(String header, String secret, String body, long now, long toleranceSeconds) {
        if (header == null || secret == null || body == null) {
            return false;
        }
        Long timestamp = null;
        String v1 = null;
        for (String part : header.split(",")) {
            String[] kv = part.strip().split("=", 2);
            if (kv.length != 2) {
                continue;
            }
            if (kv[0].equals("t")) {
                try {
                    timestamp = Long.parseLong(kv[1]);
                } catch (NumberFormatException e) {
                    return false;
                }
            } else if (kv[0].equals("v1")) {
                v1 = kv[1];
            }
        }
        if (timestamp == null || v1 == null || Math.abs(now - timestamp) > toleranceSeconds) {
            return false;
        }
        byte[] expected = digest(secret, timestamp, body);
        byte[] presented;
        try {
            presented = HexFormat.of().parseHex(v1);
        } catch (IllegalArgumentException e) {
            return false;
        }
        return MessageDigest.isEqual(expected, presented);
    }

    private static byte[] digest(String secret, long timestamp, String body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal((timestamp + "." + body).getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("HMAC-SHA256 is unavailable", e);
        }
    }
}
