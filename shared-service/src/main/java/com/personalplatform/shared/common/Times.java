package com.personalplatform.shared.common;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

/** jOOQ maps timestamptz to OffsetDateTime; the rest of the service speaks Instant. */
public final class Times {

    private Times() {}

    public static OffsetDateTime odt(Instant i) {
        return i == null ? null : OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }

    public static Instant instant(OffsetDateTime o) {
        return o == null ? null : o.toInstant();
    }
}
