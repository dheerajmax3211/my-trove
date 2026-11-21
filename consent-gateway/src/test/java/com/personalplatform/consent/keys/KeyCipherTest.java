package com.personalplatform.consent.keys;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.junit.jupiter.api.Test;

class KeyCipherTest {

    static final byte[] KEY = "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8);

    @Test
    void roundTripsAndNeverStoresPlaintext() {
        KeyCipher c = new KeyCipher(KEY);
        byte[] secret = "-----not a real private key, but pretend-----".getBytes(StandardCharsets.UTF_8);
        byte[] blob = c.encrypt("kid-1", secret);
        assertThat(new String(blob, StandardCharsets.ISO_8859_1)).doesNotContain("pretend");
        assertThat(blob).hasSize(12 + secret.length + 16);
        assertThat(c.decrypt("kid-1", blob)).isEqualTo(secret);
    }

    @Test
    void sameInputEncryptsDifferentlyEachTime() {
        KeyCipher c = new KeyCipher(KEY);
        assertThat(c.encrypt("k", new byte[] {1, 2, 3})).isNotEqualTo(c.encrypt("k", new byte[] {1, 2, 3}));
    }

    @Test
    void wrongKeyTamperingOrWrongKidAreRejected() {
        KeyCipher c = new KeyCipher(KEY);
        byte[] blob = c.encrypt("kid-1", new byte[] {9, 9, 9});
        assertThatThrownBy(() -> new KeyCipher("ffffffffffffffffffffffffffffffff".getBytes(StandardCharsets.UTF_8)).decrypt("kid-1", blob))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> c.decrypt("kid-2", blob)).isInstanceOf(IllegalStateException.class);
        byte[] flipped = blob.clone();
        flipped[flipped.length - 1] ^= 1;
        assertThatThrownBy(() -> c.decrypt("kid-1", flipped)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void errorMessagesNeverContainKeyMaterial() {
        KeyCipher c = new KeyCipher(KEY);
        byte[] blob = c.encrypt("kid-1", new byte[] {9});
        assertThatThrownBy(() -> c.decrypt("other", blob)).hasMessageNotContaining("0123456789abcdef");
    }

    @Test
    void parsesBase64AndRejectsMissingOrShortKeys() {
        assertThat(KeyCipher.fromBase64(Base64.getEncoder().encodeToString(KEY))).isNotNull();
        assertThatThrownBy(() -> KeyCipher.fromBase64(null)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> KeyCipher.fromBase64("  ")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> KeyCipher.fromBase64("not base64 !!!")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> KeyCipher.fromBase64(Base64.getEncoder().encodeToString(new byte[16])))
                .isInstanceOf(IllegalStateException.class);
    }
}
