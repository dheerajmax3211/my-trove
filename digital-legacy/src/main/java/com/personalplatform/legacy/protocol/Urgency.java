package com.personalplatform.legacy.protocol;

/** Ordered by increasing urgency; an escalation schedule may never decrease it. */
public enum Urgency {
    NOTICE,
    WARNING,
    URGENT,
    FINAL
}
