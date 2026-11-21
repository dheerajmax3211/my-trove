package com.personalplatform.legacy.protocol;

/** States of the check-in protocol. RELEASED is terminal. */
public enum SwitchState {
    ACTIVE,
    GRACE,
    ESCALATING,
    RELEASE_PENDING,
    RELEASED;

    public boolean terminal() {
        return this == RELEASED;
    }
}
