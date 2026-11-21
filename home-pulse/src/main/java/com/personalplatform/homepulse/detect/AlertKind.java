package com.personalplatform.homepulse.detect;

public enum AlertKind {
    /** Active (ON-state) power draw moved away from the learned normal, e.g. a compressor drawing 18% more. */
    POWER_SHIFT,
    /** Fraction of time ON or the length of ON cycles drifted from normal. */
    DUTY_CYCLE_DRIFT,
    /** Appliance has been ON far longer than it ever was during learning (never-off). */
    STUCK_ON,
    /** A cycling appliance reports data but has not switched ON for far longer than normal (dead / unplugged). */
    STOPPED,
    /** The sensor/plug stopped reporting. */
    NO_DATA
}
