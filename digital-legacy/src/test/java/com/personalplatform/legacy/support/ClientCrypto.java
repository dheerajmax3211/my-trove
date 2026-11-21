package com.personalplatform.legacy.support;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.spec.MGF1ParameterSpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.OAEPParameterSpec;
import javax.crypto.spec.PSource;
import javax.crypto.spec.SecretKeySpec;

/**
 * REFERENCE CLIENT. Plays the role of the owner's and trustees' devices in tests; the server never runs this code.
 * Documents the envelope formats the server validates (see README):
 * <ul>
 *   <li>vault: AES-256-GCM, 12-byte random nonce in metadata, AAD = "digital-legacy/vault/v1", ct = ciphertext||tag</li>
 *   <li>share to X25519 key: ephemeral X25519, HKDF-SHA256(salt = epkRaw||recipientRaw, info = "digital-legacy/share/v1")
 *       -> AES-256-GCM, AAD = "digital-legacy/share/v1|vaultId|trusteeId|vaultVersion"</li>
 *   <li>share to RSA key: random AES-256 CEK wrapped with RSA-OAEP(SHA-256, MGF1-SHA-256), same AES-GCM and AAD</li>
 * </ul>
 */
public final class ClientCrypto {

    public static final String VAULT_AAD = "digital-legacy/vault/v1";
    private static final byte[] X25519_SPKI_PREFIX = hex("302a300506032b656e032100");
    private static final Base64.Encoder B64 = Base64.getEncoder();
    private static final Base64.Decoder UNB64 = Base64.getDecoder();

    private ClientCrypto() {}

    // ---- vault encryption --------------------------------------------------------------------------------

    public static byte[] newVaultKey(SecureRandom rnd) {
        byte[] k = new byte[32];
        rnd.nextBytes(k);
        return k;
    }

    public record EncryptedVault(String ciphertextB64, Map<String, Object> metadata) {}

    public static EncryptedVault encryptVault(byte[] key, byte[] plaintext, SecureRandom rnd) {
        try {
            byte[] nonce = new byte[12];
            rnd.nextBytes(nonce);
            byte[] ct = gcm(Cipher.ENCRYPT_MODE, key, nonce, VAULT_AAD.getBytes(StandardCharsets.UTF_8), plaintext);
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("v", 1);
            meta.put("alg", "AES-256-GCM");
            meta.put("nonce", B64.encodeToString(nonce));
            return new EncryptedVault(B64.encodeToString(ct), meta);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public static byte[] decryptVault(byte[] key, String ciphertextB64, Map<String, Object> metadata)
            throws GeneralSecurityException {
        byte[] nonce = UNB64.decode((String) metadata.get("nonce"));
        return gcm(Cipher.DECRYPT_MODE, key, nonce, VAULT_AAD.getBytes(StandardCharsets.UTF_8),
                UNB64.decode(ciphertextB64));
    }

    // ---- trustee keys ------------------------------------------------------------------------------------

    public record TrusteeKeys(String algorithm, PrivateKey privateKey, byte[] spki) {
        public String publicKeyB64() {
            return B64.encodeToString(spki);
        }
    }

    public static TrusteeKeys generateX25519() {
        try {
            KeyPair kp = KeyPairGenerator.getInstance("X25519").generateKeyPair();
            return new TrusteeKeys("X25519", kp.getPrivate(), kp.getPublic().getEncoded());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public static TrusteeKeys generateRsa() {
        try {
            KeyPairGenerator g = KeyPairGenerator.getInstance("RSA");
            g.initialize(2048);
            KeyPair kp = g.generateKeyPair();
            return new TrusteeKeys("RSA-OAEP", kp.getPrivate(), kp.getPublic().getEncoded());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    // ---- sealing shares ----------------------------------------------------------------------------------

    public static String shareAad(UUID vaultId, UUID trusteeId, int vaultVersion) {
        return "digital-legacy/share/v1|" + vaultId + "|" + trusteeId + "|" + vaultVersion;
    }

    public static Map<String, Object> sealShare(byte[] share, String keyAlgorithm, byte[] recipientSpki, UUID vaultId,
            UUID trusteeId, int vaultVersion, SecureRandom rnd) {
        try {
            byte[] aad = shareAad(vaultId, trusteeId, vaultVersion).getBytes(StandardCharsets.UTF_8);
            byte[] nonce = new byte[12];
            rnd.nextBytes(nonce);
            Map<String, Object> env = new LinkedHashMap<>();
            env.put("v", 1);
            if ("X25519".equals(keyAlgorithm)) {
                KeyPair eph = KeyPairGenerator.getInstance("X25519").generateKeyPair();
                PublicKey recipient = KeyFactory.getInstance("X25519").generatePublic(new X509EncodedKeySpec(recipientSpki));
                byte[] epkRaw = rawX25519(eph.getPublic().getEncoded());
                byte[] cek = hkdf(ecdh(eph.getPrivate(), recipient), concat(epkRaw, rawX25519(recipientSpki)));
                env.put("alg", "X25519-HKDF-SHA256-AES256GCM");
                env.put("epk", B64.encodeToString(epkRaw));
                env.put("nonce", B64.encodeToString(nonce));
                env.put("ct", B64.encodeToString(gcm(Cipher.ENCRYPT_MODE, cek, nonce, aad, share)));
            } else {
                byte[] cek = new byte[32];
                rnd.nextBytes(cek);
                PublicKey recipient = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(recipientSpki));
                Cipher rsa = Cipher.getInstance("RSA/ECB/OAEPPadding");
                rsa.init(Cipher.ENCRYPT_MODE, recipient, oaep());
                env.put("alg", "RSA-OAEP-SHA256-AES256GCM");
                env.put("ek", B64.encodeToString(rsa.doFinal(cek)));
                env.put("nonce", B64.encodeToString(nonce));
                env.put("ct", B64.encodeToString(gcm(Cipher.ENCRYPT_MODE, cek, nonce, aad, share)));
            }
            return env;
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    public static byte[] openShare(Map<String, Object> env, TrusteeKeys keys, UUID vaultId, UUID trusteeId,
            int vaultVersion) throws GeneralSecurityException {
        byte[] aad = shareAad(vaultId, trusteeId, vaultVersion).getBytes(StandardCharsets.UTF_8);
        byte[] nonce = UNB64.decode((String) env.get("nonce"));
        byte[] ct = UNB64.decode((String) env.get("ct"));
        byte[] cek;
        if ("X25519".equals(keys.algorithm())) {
            PublicKey eph = KeyFactory.getInstance("X25519").generatePublic(new X509EncodedKeySpec(
                    concat(X25519_SPKI_PREFIX, UNB64.decode((String) env.get("epk")))));
            byte[] epkRaw = UNB64.decode((String) env.get("epk"));
            cek = hkdf(ecdh(keys.privateKey(), eph), concat(epkRaw, rawX25519(keys.spki())));
        } else {
            Cipher rsa = Cipher.getInstance("RSA/ECB/OAEPPadding");
            rsa.init(Cipher.DECRYPT_MODE, keys.privateKey(), oaep());
            cek = rsa.doFinal(UNB64.decode((String) env.get("ek")));
        }
        return gcm(Cipher.DECRYPT_MODE, cek, nonce, aad, ct);
    }

    // ---- primitives --------------------------------------------------------------------------------------

    private static OAEPParameterSpec oaep() {
        return new OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, PSource.PSpecified.DEFAULT);
    }

    private static byte[] gcm(int mode, byte[] key, byte[] nonce, byte[] aad, byte[] data)
            throws GeneralSecurityException {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(mode, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
        c.updateAAD(aad);
        return c.doFinal(data);
    }

    private static byte[] ecdh(PrivateKey priv, PublicKey pub) throws GeneralSecurityException {
        KeyAgreement ka = KeyAgreement.getInstance("X25519");
        ka.init(priv);
        ka.doPhase(pub, true);
        return ka.generateSecret();
    }

    /** HKDF-SHA256 (RFC 5869), 32 output bytes. */
    private static byte[] hkdf(byte[] ikm, byte[] salt) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(salt, "HmacSHA256"));
        byte[] prk = mac.doFinal(ikm);
        mac.init(new SecretKeySpec(prk, "HmacSHA256"));
        mac.update("digital-legacy/share/v1".getBytes(StandardCharsets.UTF_8));
        mac.update((byte) 1);
        return mac.doFinal();
    }

    private static byte[] rawX25519(byte[] spki) {
        return Arrays.copyOfRange(spki, spki.length - 32, spki.length);
    }

    private static byte[] concat(byte[] a, byte[] b) {
        return ByteBuffer.allocate(a.length + b.length).put(a).put(b).array();
    }

    private static byte[] hex(String s) {
        return java.util.HexFormat.of().parseHex(s);
    }
}
