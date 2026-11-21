package com.personalplatform.homepulse.device;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class DeviceTokensTest {

    @Test
    void tokensAreUniqueHighEntropyAndPrefixed() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 1000; i++) {
            String t = DeviceTokens.generate();
            assertThat(t).startsWith("hpd_").matches("[A-Za-z0-9_\\-]+");
            assertThat(t.length()).isEqualTo(4 + 43);   // 32 random bytes in base64url
            assertThat(DeviceTokens.looksLikeToken(t)).isTrue();
            assertThat(seen.add(t)).isTrue();
        }
    }

    @Test
    void hashIsStableSha256HexAndDoesNotContainTheToken() {
        assertThat(DeviceTokens.hash("hpd_abc")).hasSize(64).matches("[0-9a-f]{64}").isEqualTo(DeviceTokens.hash("hpd_abc"));
        assertThat(DeviceTokens.hash("hpd_abc")).isNotEqualTo(DeviceTokens.hash("hpd_abd"));
        // known SHA-256 vector
        assertThat(DeviceTokens.hash("abc")).isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    @Test
    void obviousGarbageIsRejectedBeforeAnyLookup() {
        assertThat(DeviceTokens.looksLikeToken(null)).isFalse();
        assertThat(DeviceTokens.looksLikeToken("")).isFalse();
        assertThat(DeviceTokens.looksLikeToken("hpd_short")).isFalse();
        assertThat(DeviceTokens.looksLikeToken("abc" + "x".repeat(60))).isFalse();
        assertThat(DeviceTokens.looksLikeToken("hpd_" + "x".repeat(500))).isFalse();
    }
}
