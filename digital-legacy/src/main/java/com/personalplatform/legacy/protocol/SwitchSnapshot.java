package com.personalplatform.legacy.protocol;

import java.time.Instant;

/**
 * The timing-relevant part of a vault, as a plain value so the state machine stays pure.
 *
 * @param nextDueAt       when the next check-in is due (meaningful in ACTIVE)
 * @param pausedUntil     non-null while a vacation pause is running (ACTIVE only)
 * @param enteredAt       when the current state was (nominally) entered; the anchor of every relative timer
 * @param stepsExecuted   escalation steps already executed in the current incident
 * @param quorumReachedAt RELEASE_PENDING only: when approvals first reached the quorum
 */
public record SwitchSnapshot(
        SwitchState state,
        Instant nextDueAt,
        Instant pausedUntil,
        Instant enteredAt,
        int stepsExecuted,
        Instant quorumReachedAt) {

    public static SwitchSnapshot active(Instant now, SwitchPolicy policy) {
        return new SwitchSnapshot(SwitchState.ACTIVE, now.plus(policy.checkInInterval()), null, now, 0, null);
    }

    public boolean paused() {
        return pausedUntil != null;
    }
}
