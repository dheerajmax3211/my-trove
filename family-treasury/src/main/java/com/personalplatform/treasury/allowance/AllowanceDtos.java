package com.personalplatform.treasury.allowance;

import static com.personalplatform.treasury.household.Dtos.MAX_AMOUNT;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.UUID;

public final class AllowanceDtos {

    private AllowanceDtos() {}

    /** fromAccountId defaults to the household POOL. startDate (UTC) must not be in the past. */
    public record CreateScheduleRequest(
            UUID fromAccountId, @NotNull UUID toAccountId,
            @Positive @Max(MAX_AMOUNT) long amountMinor,
            @NotNull Frequency frequency, @NotNull LocalDate startDate,
            @NotBlank @Size(max = 200) String description) {}

    public record ScheduleView(
            UUID id, UUID fromAccountId, UUID toAccountId, long amountMinor, String currency, Frequency frequency,
            LocalDate startDate, LocalDate nextDueOn, boolean active, String description) {}

    public record RunSummary(int paid, int skipped, int failed) {}
}
