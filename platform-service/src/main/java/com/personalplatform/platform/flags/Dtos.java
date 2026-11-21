package com.personalplatform.platform.flags;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Wire types of the flag endpoints. */
final class Dtos {

    /** Flag keys: lower case, digits, dot, dash, underscore; 1 to 64 characters, starting with a letter or digit. */
    static final String KEY_PATTERN = "[a-z0-9][a-z0-9._-]{0,63}";
    /** Plan and role names are the upper case identifiers the token carries (FREE, PRO, DEVELOPER, ADMIN, ...). */
    static final String NAME_PATTERN = "[A-Z][A-Z0-9_]{0,31}";
    static final int MAX_NAMES = 20;

    private Dtos() {
    }

    /**
     * Create and update body. {@code key} is required on create and optional on update (when present it must equal the
     * path). Omitted {@code description} is empty, {@code enabled} is false, {@code rolloutPercent} is 100; a null or empty
     * list means "no restriction".
     */
    record FlagRequest(
            @Pattern(regexp = KEY_PATTERN, message = "must be 1-64 characters of a-z, 0-9, '.', '_' or '-', starting with a letter or digit") String key,
            @Size(max = 500, message = "must be at most 500 characters") String description,
            Boolean enabled,
            @Min(value = 0, message = "must be between 0 and 100") @Max(value = 100, message = "must be between 0 and 100") Integer rolloutPercent,
            @Size(max = MAX_NAMES, message = "must have at most 20 entries") List<@Pattern(regexp = NAME_PATTERN, message = "must be an upper case name such as PRO") String> allowedPlans,
            @Size(max = MAX_NAMES, message = "must have at most 20 entries") List<@Pattern(regexp = NAME_PATTERN, message = "must be an upper case name such as ADMIN") String> allowedRoles) {
    }

    record Flag(String key, String description, boolean enabled, int rolloutPercent, List<String> allowedPlans,
                List<String> allowedRoles, Instant createdAt, Instant updatedAt, String updatedBy) {
    }

    record Evaluation(Map<String, Boolean> flags) {
    }
}
