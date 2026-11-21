package com.personalplatform.legacy.vault;

import com.personalplatform.legacy.config.LegacyProperties;
import com.personalplatform.legacy.config.Tokens;
import com.personalplatform.legacy.web.InvalidRequestException;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.springframework.stereotype.Component;

/**
 * Format-only validation of everything the client hands us. The server cannot (and must not be able to) check that
 * ciphertext decrypts or that a share is a valid Shamir share: it checks algorithm ids, sizes and encodings, nothing
 * about content. Error messages never echo submitted values.
 *
 * <h3>Formats (all binary fields are standard Base64 with padding)</h3>
 * <ul>
 *   <li>Vault metadata: {@code {"v":1,"alg":"AES-256-GCM","nonce":b64(12 bytes),"kdf":{...}?}}</li>
 *   <li>Trustee public key: algorithm {@code X25519} or {@code RSA-OAEP}, key = X.509 SubjectPublicKeyInfo DER</li>
 *   <li>Sealed share (X25519): {@code {"v":1,"alg":"X25519-HKDF-SHA256-AES256GCM","epk":b64(32),"nonce":b64(12),"ct":b64}}</li>
 *   <li>Sealed share (RSA): {@code {"v":1,"alg":"RSA-OAEP-SHA256-AES256GCM","ek":b64(RSA block),"nonce":b64(12),"ct":b64}}</li>
 * </ul>
 */
@Component
public class EnvelopeValidator {

    public static final String VAULT_ALG = "AES-256-GCM";
    public static final String KEY_X25519 = "X25519";
    public static final String KEY_RSA = "RSA-OAEP";
    public static final String SHARE_X25519 = "X25519-HKDF-SHA256-AES256GCM";
    public static final String SHARE_RSA = "RSA-OAEP-SHA256-AES256GCM";

    private static final int GCM_TAG = 16;
    private static final int GCM_NONCE = 12;
    private static final int MAX_SEALED_CT = 4096;

    private final LegacyProperties props;

    public EnvelopeValidator(LegacyProperties props) {
        this.props = props;
    }

    public record ValidatedVault(byte[] ciphertext, byte[] sha256, String metadataJson) {}

    public record ValidatedKey(String algorithm, byte[] spki, String fingerprint) {}

    public record ValidatedShare(String canonicalJson, byte[] sha256) {}

    public ValidatedVault validateVault(String ciphertextB64, Map<String, Object> metadata,
            com.personalplatform.legacy.config.Json json) {
        List<String> problems = new ArrayList<>();
        byte[] ct = decode("ciphertext", ciphertextB64, problems);
        if (ct != null) {
            if (ct.length < GCM_TAG + 1) {
                problems.add("ciphertext is too short to be AES-GCM output");
            }
            if (ct.length > props.maxCiphertextBytes()) {
                problems.add("ciphertext exceeds " + props.maxCiphertextBytes() + " bytes");
            }
        }
        String metaJson = null;
        if (metadata == null) {
            problems.add("metadata is required");
        } else {
            metadata = new TreeMap<>(metadata);
            checkKeys("metadata", metadata, Set.of("v", "alg", "nonce", "kdf"), problems);
            expectInt("metadata.v", metadata.get("v"), 1, 1, problems);
            if (!VAULT_ALG.equals(metadata.get("alg"))) {
                problems.add("metadata.alg must be " + VAULT_ALG);
            }
            expectBytes("metadata.nonce", metadata.get("nonce"), GCM_NONCE, GCM_NONCE, problems);
            if (metadata.containsKey("kdf")) {
                validateKdf(metadata.get("kdf"), problems);
            }
            if (problems.isEmpty()) {
                metaJson = json.toString(metadata);
                if (metaJson.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > props.maxMetadataBytes()) {
                    problems.add("metadata exceeds " + props.maxMetadataBytes() + " bytes");
                }
            }
        }
        if (!problems.isEmpty()) {
            throw new InvalidRequestException(problems);
        }
        return new ValidatedVault(ct, Tokens.sha256(ct), metaJson);
    }

    @SuppressWarnings("unchecked")
    private void validateKdf(Object kdfObj, List<String> problems) {
        if (!(kdfObj instanceof Map<?, ?> raw)) {
            problems.add("metadata.kdf must be an object");
            return;
        }
        Map<String, Object> kdf = (Map<String, Object>) raw;
        Object name = kdf.get("name");
        expectBytes("metadata.kdf.salt", kdf.get("salt"), 16, 64, problems);
        if ("argon2id".equals(name)) {
            checkKeys("metadata.kdf", kdf, Set.of("name", "salt", "memoryKiB", "iterations", "parallelism"), problems);
            expectInt("metadata.kdf.memoryKiB", kdf.get("memoryKiB"), 19_456, 4_194_304, problems);
            expectInt("metadata.kdf.iterations", kdf.get("iterations"), 1, 20, problems);
            expectInt("metadata.kdf.parallelism", kdf.get("parallelism"), 1, 16, problems);
        } else if ("pbkdf2-sha256".equals(name)) {
            checkKeys("metadata.kdf", kdf, Set.of("name", "salt", "iterations"), problems);
            expectInt("metadata.kdf.iterations", kdf.get("iterations"), 210_000, 20_000_000, problems);
        } else {
            problems.add("metadata.kdf.name must be argon2id or pbkdf2-sha256");
        }
    }

    public ValidatedKey validatePublicKey(String algorithm, String spkiB64) {
        List<String> problems = new ArrayList<>();
        byte[] spki = decode("publicKey", spkiB64, problems);
        if (spki != null && problems.isEmpty()) {
            try {
                if (KEY_X25519.equals(algorithm)) {
                    var key = KeyFactory.getInstance("X25519").generatePublic(new X509EncodedKeySpec(spki));
                    if (!java.util.Arrays.equals(key.getEncoded(), spki) || spki.length != 44) {
                        problems.add("publicKey is not a canonical X25519 SubjectPublicKeyInfo");
                    }
                } else if (KEY_RSA.equals(algorithm)) {
                    var key = (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(spki));
                    int bits = key.getModulus().bitLength();
                    if (bits < 2048 || bits > 4096) {
                        problems.add("RSA key must be 2048..4096 bits");
                    }
                    if (key.getPublicExponent().bitLength() < 16) {
                        problems.add("RSA public exponent is too small");
                    }
                } else {
                    problems.add("keyAlgorithm must be " + KEY_X25519 + " or " + KEY_RSA);
                }
            } catch (GeneralSecurityException | ClassCastException e) {
                problems.add("publicKey is not a valid " + algorithm + " X.509 SubjectPublicKeyInfo");
            }
        }
        if (!problems.isEmpty()) {
            throw new InvalidRequestException(problems);
        }
        return new ValidatedKey(algorithm, spki, Tokens.hex(Tokens.sha256(spki)));
    }

    /** The share envelope's algorithm must be the one that matches the trustee's registered key. */
    public ValidatedShare validateSealedShare(Map<String, Object> envelope, String keyAlgorithm,
            com.personalplatform.legacy.config.Json json) {
        List<String> problems = new ArrayList<>();
        if (envelope == null) {
            throw new InvalidRequestException("sealedShare is required");
        }
        Map<String, Object> env = new TreeMap<>(envelope);
        expectInt("sealedShare.v", env.get("v"), 1, 1, problems);
        if (KEY_X25519.equals(keyAlgorithm)) {
            checkKeys("sealedShare", env, Set.of("v", "alg", "epk", "nonce", "ct"), problems);
            if (!SHARE_X25519.equals(env.get("alg"))) {
                problems.add("sealedShare.alg must be " + SHARE_X25519 + " for an X25519 trustee");
            }
            expectBytes("sealedShare.epk", env.get("epk"), 32, 32, problems);
        } else if (KEY_RSA.equals(keyAlgorithm)) {
            checkKeys("sealedShare", env, Set.of("v", "alg", "ek", "nonce", "ct"), problems);
            if (!SHARE_RSA.equals(env.get("alg"))) {
                problems.add("sealedShare.alg must be " + SHARE_RSA + " for an RSA-OAEP trustee");
            }
            expectBytes("sealedShare.ek", env.get("ek"), 256, 512, problems);
        } else {
            problems.add("trustee has no registered public key");
        }
        expectBytes("sealedShare.nonce", env.get("nonce"), GCM_NONCE, GCM_NONCE, problems);
        // smallest sealed share: tag + header(7) + 1 byte
        expectBytes("sealedShare.ct", env.get("ct"), GCM_TAG + 8, MAX_SEALED_CT, problems);
        if (!problems.isEmpty()) {
            throw new InvalidRequestException(problems);
        }
        String canonical = json.toString(env);
        return new ValidatedShare(canonical, Tokens.sha256(canonical));
    }

    // ---- helpers -----------------------------------------------------------------------------------------

    private static byte[] decode(String field, String value, List<String> problems) {
        if (value == null || value.isBlank()) {
            problems.add(field + " is required");
            return null;
        }
        try {
            return Base64.getDecoder().decode(value);
        } catch (IllegalArgumentException e) {
            problems.add(field + " is not valid Base64");
            return null;
        }
    }

    private static void expectBytes(String field, Object value, int min, int max, List<String> problems) {
        if (!(value instanceof String s)) {
            problems.add(field + " must be a Base64 string");
            return;
        }
        try {
            int n = Base64.getDecoder().decode(s).length;
            if (n < min || n > max) {
                problems.add(field + " must decode to " + (min == max ? min + " bytes" : min + ".." + max + " bytes"));
            }
        } catch (IllegalArgumentException e) {
            problems.add(field + " is not valid Base64");
        }
    }

    private static void expectInt(String field, Object value, int min, int max, List<String> problems) {
        if (!(value instanceof Integer || value instanceof Long)) {
            problems.add(field + " must be an integer");
            return;
        }
        long v = ((Number) value).longValue();
        if (v < min || v > max) {
            problems.add(field + " must be between " + min + " and " + max);
        }
    }

    private static void checkKeys(String field, Map<String, Object> map, Set<String> allowed, List<String> problems) {
        for (String k : map.keySet()) {
            if (!allowed.contains(k)) {
                problems.add(field + " has an unknown field '" + (k.length() > 32 ? k.substring(0, 32) : k) + "'");
            }
        }
    }
}
