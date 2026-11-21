package com.personalplatform.shared.file;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Signed, expiring download capability: {@code base64url(v1.fileId.expEpochSec) + "." + base64url(HMAC-SHA256)}.
 * The signature covers the encoded payload string, so there is nothing to canonicalize; comparison is constant-time.
 * Every failure mode (malformed, bad signature, expired) raises the same {@link InvalidTokenException}.
 */
public class DownloadTokenService {

    public static class InvalidTokenException extends RuntimeException {
        public InvalidTokenException() {
            super("Invalid or expired download token");
        }
    }

    public record Issued(String token, Instant expiresAt) {}

    private static final String ALGORITHM = "HmacSHA256";
    private static final Base64.Encoder ENC = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DEC = Base64.getUrlDecoder();

    private final byte[] secret;
    private final Clock clock;
    private final Duration defaultTtl;
    private final Duration maxTtl;

    public DownloadTokenService(byte[] secret, Clock clock, Duration defaultTtl, Duration maxTtl) {
        if (secret == null || secret.length < 32) {
            throw new IllegalArgumentException("Download token secret must be at least 32 bytes");
        }
        this.secret = secret.clone();
        this.clock = clock;
        this.defaultTtl = defaultTtl;
        this.maxTtl = maxTtl;
    }

    public Issued issue(UUID fileId, Duration requestedTtl) {
        Duration ttl = requestedTtl == null ? defaultTtl : requestedTtl;
        if (ttl.isNegative() || ttl.isZero() || ttl.compareTo(maxTtl) > 0) {
            throw new IllegalArgumentException("ttl must be positive and at most " + maxTtl);
        }
        Instant exp = clock.instant().plus(ttl);
        String payload = ENC.encodeToString(("v1." + fileId + "." + exp.getEpochSecond()).getBytes(StandardCharsets.UTF_8));
        return new Issued(payload + "." + ENC.encodeToString(hmac(payload)), exp);
    }

    /** @return the file id the token grants access to. */
    public UUID verify(String token) {
        try {
            if (token == null) {
                throw new InvalidTokenException();
            }
            int dot = token.indexOf('.');
            if (dot <= 0 || dot != token.lastIndexOf('.')) {
                throw new InvalidTokenException();
            }
            String payload = token.substring(0, dot);
            byte[] given = DEC.decode(token.substring(dot + 1));
            if (!MessageDigest.isEqual(given, hmac(payload))) {
                throw new InvalidTokenException();
            }
            String[] parts = new String(DEC.decode(payload), StandardCharsets.UTF_8).split("\\.");
            if (parts.length != 3 || !parts[0].equals("v1")) {
                throw new InvalidTokenException();
            }
            if (!clock.instant().isBefore(Instant.ofEpochSecond(Long.parseLong(parts[2])))) {
                throw new InvalidTokenException();
            }
            return UUID.fromString(parts[1]);
        } catch (IllegalArgumentException e) { // bad base64 / number / uuid
            throw new InvalidTokenException();
        }
    }

    private byte[] hmac(String payload) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(secret, ALGORITHM));
            return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
