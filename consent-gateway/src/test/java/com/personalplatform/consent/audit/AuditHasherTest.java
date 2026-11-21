package com.personalplatform.consent.audit;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class AuditHasherTest {

    static final Instant AT = Instant.parse("2026-01-01T00:00:00Z");

    private static String h(String prev, String detail, String client) {
        return AuditHasher.hash(prev, "owner-1", 1, "DATA_READ", "CLIENT", "cl_a", client, null, detail, AT);
    }

    @Test
    void isDeterministicHex64() {
        assertThat(h(AuditHasher.GENESIS, "{}", "cl_a")).isEqualTo(h(AuditHasher.GENESIS, "{}", "cl_a")).matches("[0-9a-f]{64}");
    }

    @Test
    void everyFieldChangesTheHash() {
        String base = h(AuditHasher.GENESIS, "{}", "cl_a");
        assertThat(h("1".repeat(64), "{}", "cl_a")).isNotEqualTo(base);
        assertThat(h(AuditHasher.GENESIS, "{\"a\":1}", "cl_a")).isNotEqualTo(base);
        assertThat(h(AuditHasher.GENESIS, "{}", "cl_b")).isNotEqualTo(base);
        assertThat(h(AuditHasher.GENESIS, "{}", null)).isNotEqualTo(base);
        assertThat(AuditHasher.hash(AuditHasher.GENESIS, "owner-1", 2, "DATA_READ", "CLIENT", "cl_a", "cl_a", null, "{}", AT)).isNotEqualTo(base);
        assertThat(AuditHasher.hash(AuditHasher.GENESIS, "owner-1", 1, "DATA_READ", "CLIENT", "cl_a", "cl_a", null, "{}", AT.plusNanos(1000))).isNotEqualTo(base);
    }

    @Test
    void fieldBoundariesAreUnambiguous() {
        // moving a character from one field to the next must not produce the same digest
        String a = AuditHasher.hash(AuditHasher.GENESIS, "ab", 1, "E", "c", "d", null, null, "{}", AT);
        String b = AuditHasher.hash(AuditHasher.GENESIS, "a", 1, "bE", "c", "d", null, null, "{}", AT);
        assertThat(a).isNotEqualTo(b);
        // null differs from the literal string "-"
        assertThat(h(AuditHasher.GENESIS, "{}", null)).isNotEqualTo(h(AuditHasher.GENESIS, "{}", "-"));
    }
}
