package com.personalplatform.waitingon.item;

/** Kinds of entries on an item's append-only timeline. */
public enum EventType {
    CREATED,
    NUDGE_SENT,
    ESCALATION_DRAFTED,
    FINAL_NOTICE_DRAFTED,
    REPLY_RECEIVED,
    SNOOZED,
    RESOLVED,
    EXPIRED,
    CANCELLED
}
