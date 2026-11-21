package com.personalplatform.legacy.notify;

public enum NotificationKind {
    /** First, gentle nudge to the owner when a check-in is missed. */
    CHECK_IN_MISSED,
    /** A scheduled escalation ping. */
    ESCALATION,
    /** Trustees: release is pending and their vote is needed. Owner: last chance to cancel. */
    RELEASE_PENDING,
    /** Trustees: the owner is back, release cancelled. */
    OWNER_RETURNED,
    /** The vault has been released. */
    RELEASED
}
