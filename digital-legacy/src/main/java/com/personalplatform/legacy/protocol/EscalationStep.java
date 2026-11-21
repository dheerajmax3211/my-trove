package com.personalplatform.legacy.protocol;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import java.util.List;

/**
 * One scheduled ping inside the ESCALATING state. {@code offsetSeconds} is measured from the moment the state was
 * entered. {@code channels} is the ordered preference of channel types: the dispatcher tries the recipient's contacts
 * of the first type, then falls back down the list.
 */
public record EscalationStep(
        @Min(0) long offsetSeconds,
        @NotNull Urgency urgency,
        @NotNull Audience audience,
        @NotEmpty List<ChannelType> channels) {

    public Duration offset() {
        return Duration.ofSeconds(offsetSeconds);
    }
}
