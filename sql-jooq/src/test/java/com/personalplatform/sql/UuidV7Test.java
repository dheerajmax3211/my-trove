package com.personalplatform.sql;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.HashSet;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class UuidV7Test {

    @Test
    void hasVersion7AndRfcVariant() {
        UUID id = UuidV7.next();
        assertThat(id.version()).isEqualTo(7);
        assertThat(id.variant()).isEqualTo(2);
    }

    @Test
    void embedsCurrentTimestamp() {
        long before = System.currentTimeMillis();
        UUID id = UuidV7.next();
        long after = System.currentTimeMillis();
        assertThat(UuidV7.timestampMillis(id)).isBetween(before, after);
    }

    @Test
    void sortsByCreationTimeAcrossMilliseconds() {
        UUID earlier = UuidV7.of(1_700_000_000_000L);
        UUID later = UuidV7.of(1_700_000_000_001L);
        // Postgres compares uuid bytes unsigned and left to right; do the same here.
        assertThat(Long.compareUnsigned(earlier.getMostSignificantBits(), later.getMostSignificantBits()))
                .isNegative();
    }

    @Test
    void isUniqueWithinOneMillisecond() {
        var seen = new HashSet<UUID>();
        for (int i = 0; i < 50_000; i++) {
            assertThat(seen.add(UuidV7.of(1_700_000_000_000L))).isTrue();
        }
    }

    @Test
    void timestampRejectsOtherVersions() {
        assertThatThrownBy(() -> UuidV7.timestampMillis(UUID.randomUUID()))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
