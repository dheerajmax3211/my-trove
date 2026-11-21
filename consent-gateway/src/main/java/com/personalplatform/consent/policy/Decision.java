package com.personalplatform.consent.policy;

/** Machine-readable outcome of a policy evaluation. */
public record Decision(Effect effect, Reason reason, String message) {

    public enum Effect {
        ALLOW,
        DENY
    }

    public enum Reason {
        OK,
        NO_GRANT,
        GRANT_REVOKED,
        GRANT_EXPIRED,
        CLIENT_MISMATCH,
        MAX_READS_EXHAUSTED,
        OUTSIDE_ALLOWED_HOURS,
        PURPOSE_MISMATCH,
        SCOPE_NOT_GRANTED,
        SENSITIVITY_EXCEEDED,
        INVALID_REQUEST
    }

    public static Decision allow() {
        return new Decision(Effect.ALLOW, Reason.OK, "allowed");
    }

    public static Decision deny(Reason reason, String message) {
        return new Decision(Effect.DENY, reason, message);
    }

    public boolean isAllowed() {
        return effect == Effect.ALLOW;
    }
}
