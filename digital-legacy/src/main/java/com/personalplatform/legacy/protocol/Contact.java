package com.personalplatform.legacy.protocol;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** A way to reach a person. Lists of contacts are ordered: earlier entries are tried first. */
public record Contact(@NotNull ChannelType channel, @NotBlank @Size(max = 254) String address) {

    /** Address with all but a hint masked, safe for logs. */
    public String masked() {
        if (address == null || address.length() <= 4) {
            return "***";
        }
        return address.substring(0, 2) + "***" + address.substring(address.length() - 2);
    }
}
