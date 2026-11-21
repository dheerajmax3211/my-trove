package com.personalplatform.sql;

import java.security.SecureRandom;
import java.util.UUID;

/**
 * Time-ordered UUIDs (RFC 9562 version 7): 48-bit unix-ms timestamp followed by random bits.
 * New rows land at the right edge of the primary-key B-tree, unlike random v4 UUIDs, which
 * scatter inserts across the whole index. Ordering is by millisecond; ids created within the
 * same millisecond are unique but not ordered relative to each other.
 */
public final class UuidV7 {

    private static final SecureRandom RANDOM = new SecureRandom();

    private UuidV7() {}

    public static UUID next() {
        return of(System.currentTimeMillis());
    }

    static UUID of(long epochMillis) {
        long randA = RANDOM.nextLong() & 0x0FFFL;
        long msb = (epochMillis << 16) | (0x7L << 12) | randA;
        long lsb = (RANDOM.nextLong() & 0x3FFF_FFFF_FFFF_FFFFL) | 0x8000_0000_0000_0000L;
        return new UUID(msb, lsb);
    }

    /** Milliseconds since the epoch encoded in a v7 UUID. */
    public static long timestampMillis(UUID id) {
        if (id.version() != 7) {
            throw new IllegalArgumentException("Not a version 7 UUID: " + id);
        }
        return id.getMostSignificantBits() >>> 16;
    }
}
