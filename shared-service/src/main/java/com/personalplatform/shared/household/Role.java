package com.personalplatform.shared.household;

public enum Role {
    MEMBER, OWNER;

    public boolean atLeast(Role required) {
        return this.ordinal() >= required.ordinal();
    }
}
