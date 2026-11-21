package com.personalplatform.waitingon.workflow;

/** Where a follow-up workflow currently is. */
public enum Stage {
    AWAITING_NUDGE, NUDGED, ESCALATED, FINAL_NOTICE, RESOLVED, EXPIRED, CANCELLED, CLOSED_EXTERNALLY
}
