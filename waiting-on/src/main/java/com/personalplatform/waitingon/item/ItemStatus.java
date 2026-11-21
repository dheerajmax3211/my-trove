package com.personalplatform.waitingon.item;

import java.util.EnumSet;
import java.util.Set;

public enum ItemStatus {
    OPEN, NUDGED, ESCALATED, RESOLVED, EXPIRED, CANCELLED;

    public static final Set<ItemStatus> TERMINAL = EnumSet.of(RESOLVED, EXPIRED, CANCELLED);
    public static final Set<ItemStatus> ACTIVE = EnumSet.of(OPEN, NUDGED, ESCALATED);

    public boolean isTerminal() {
        return TERMINAL.contains(this);
    }
}
