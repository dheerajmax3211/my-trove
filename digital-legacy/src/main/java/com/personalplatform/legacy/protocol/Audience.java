package com.personalplatform.legacy.protocol;

public enum Audience {
    OWNER,
    TRUSTEES,
    ALL;

    public boolean includesOwner() {
        return this == OWNER || this == ALL;
    }

    public boolean includesTrustees() {
        return this == TRUSTEES || this == ALL;
    }
}
