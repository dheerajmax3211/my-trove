package com.personalplatform.waitingon.reply;

/** What a counterparty's reply means for the thing we are waiting on. */
public enum ReplyOutcome {
    /** Money sent / request approved / goods dispatched: the wait is over. */
    PAID,
    /** Explicit refusal: skip straight to escalation. */
    REJECTED,
    /** They need documents or details from the user: pause the chasing for a while. */
    NEEDS_INFO,
    /** Could not tell: record it and let the user look. */
    UNKNOWN
}
