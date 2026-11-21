package com.personalplatform.consent.policy;

/** Ordered sensitivity levels for vault attributes. A grant carries a ceiling; anything above it is never released. */
public enum Sensitivity {
    PUBLIC,
    PERSONAL,
    SENSITIVE,
    RESTRICTED;

    public boolean exceeds(Sensitivity ceiling) {
        return compareTo(ceiling) > 0;
    }
}
