package com.personalplatform.waitingon.escalation;

public enum Tone {
    /** Friendly reminder. */
    NUDGE,
    /** Firm formal letter citing consumer-rights style wording, with a 14 day deadline. */
    ESCALATION,
    /** Last warning before external complaint routes, with a 7 day deadline. */
    FINAL_NOTICE
}
