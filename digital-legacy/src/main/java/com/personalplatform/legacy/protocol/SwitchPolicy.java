package com.personalplatform.legacy.protocol;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import java.util.List;

/**
 * The owner's check-in policy. All durations are whole seconds so the stored JSON is unambiguous.
 *
 * @param checkInIntervalSeconds how long a check-in keeps the switch quiet
 * @param graceSeconds           silence after a missed check-in before pings start
 * @param escalationDurationSeconds total length of the ESCALATING phase (&gt;= last step offset)
 * @param steps                  escalation schedule, strictly increasing offsets, non-decreasing urgency
 * @param coolOffSeconds         time the owner keeps after the trustee quorum is reached
 * @param quorum                 approvals required (the "t" of t-of-n)
 * @param maxPauseSeconds        longest single vacation pause the owner allows themselves
 * @param ownerContacts          how to reach the owner, ordered
 */
public record SwitchPolicy(
        @Min(1) long checkInIntervalSeconds,
        @Min(0) long graceSeconds,
        @Min(0) long escalationDurationSeconds,
        @NotEmpty @Valid List<EscalationStep> steps,
        @Min(1) long coolOffSeconds,
        @Min(1) int quorum,
        @Min(0) long maxPauseSeconds,
        @NotEmpty @Valid List<Contact> ownerContacts) {

    public SwitchPolicy {
        steps = steps == null ? null : List.copyOf(steps);
        ownerContacts = ownerContacts == null ? null : List.copyOf(ownerContacts);
    }

    public Duration checkInInterval() {
        return Duration.ofSeconds(checkInIntervalSeconds);
    }

    public Duration grace() {
        return Duration.ofSeconds(graceSeconds);
    }

    public Duration escalationDuration() {
        return Duration.ofSeconds(escalationDurationSeconds);
    }

    public Duration coolOff() {
        return Duration.ofSeconds(coolOffSeconds);
    }

    public Duration maxPause() {
        return Duration.ofSeconds(maxPauseSeconds);
    }
}
