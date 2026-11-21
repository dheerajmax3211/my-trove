package com.personalplatform.auth.token;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Encrypts signing-key material at rest with AES-256-GCM. Blob layout: 12-byte random IV || ciphertext || 16-byte tag.
 * The key id is bound as additional authenticated data, so a ciphertext cannot be moved to another row.
 */
public final class KeyCipher {

    public static final String ALGORITHM = "AES-256-GCM-v1";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final SecretKeySpec key;

    public KeyCipher(byte[] rawKey) {
        if (rawKey == null || rawKey.length != 32) {
            throw new IllegalStateException("The key-encryption key must be exactly 32 bytes (base64-encoded)");
        }
        this.key = new SecretKeySpec(rawKey, "AES");
    }

    /** Parses the {@code APP_PLATFORM_KEY_ENCRYPTION_KEY} value (standard or url-safe base64 of 32 bytes). */
    public static KeyCipher fromBase64(String base64) {
        if (base64 == null || base64.isBlank()) {
            throw new IllegalStateException("APP_PLATFORM_KEY_ENCRYPTION_KEY (app.platform.key-encryption-key) must be "
                    + "set: base64 of 32 random bytes");
        }
        byte[] raw;
        try {
            raw = Base64.getMimeDecoder().decode(base64.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("APP_PLATFORM_KEY_ENCRYPTION_KEY is not valid base64");
        }
        try {
            return new KeyCipher(raw);
        } finally {
            Arrays.fill(raw, (byte) 0);
        }
    }

    public byte[] encrypt(String keyId, byte[] plaintext) {
        try {
            byte[] iv = new byte[IV_BYTES];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(keyId.getBytes(StandardCharsets.UTF_8));
            byte[] ct = cipher.doFinal(plaintext);
            byte[] out = new byte[IV_BYTES + ct.length];
            System.arraycopy(iv, 0, out, 0, IV_BYTES);
            System.arraycopy(ct, 0, out, IV_BYTES, ct.length);
            return out;
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Key encryption failed", e);
        }
    }

    public byte[] decrypt(String keyId, byte[] blob) {
        if (blob == null || blob.length <= IV_BYTES) {
            throw new IllegalStateException("Encrypted key blob is malformed for kid " + keyId);
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, blob, 0, IV_BYTES));
            cipher.updateAAD(keyId.getBytes(StandardCharsets.UTF_8));
            return cipher.doFinal(blob, IV_BYTES, blob.length - IV_BYTES);
        } catch (GeneralSecurityException e) {
            // Deliberately vague: wrong KEK, tampered blob or wrong kid all look the same.
            throw new IllegalStateException("Cannot decrypt signing key " + keyId
                    + " (wrong APP_PLATFORM_KEY_ENCRYPTION_KEY or corrupted data)");
        }
    }
}
