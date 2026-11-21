package com.personalplatform.treasury.ops;

import static com.personalplatform.treasury.household.Dtos.MAX_AMOUNT;

import com.personalplatform.treasury.approval.ApprovalView;
import com.personalplatform.treasury.ledger.EntryView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public final class OpsDtos {

    private OpsDtos() {}

    /** Deposit income into the pool (or another asset account). Defaults: POOL and INCOME:DEPOSITS. */
    public record DepositRequest(
            UUID toAccountId, UUID incomeAccountId,
            @Positive @Max(MAX_AMOUNT) long amountMinor,
            @NotBlank @Size(max = 500) String description) {}

    /** Spend from an asset account (default POOL) into an expense category (default EXPENSE:GENERAL). */
    public record SpendRequest(
            UUID fromAccountId, UUID categoryAccountId,
            @Positive @Max(MAX_AMOUNT) long amountMinor,
            @NotBlank @Size(max = 500) String description) {}

    public record TransferRequest(
            @NotNull UUID fromAccountId, @NotNull UUID toAccountId,
            @Positive @Max(MAX_AMOUNT) long amountMinor,
            @NotBlank @Size(max = 500) String description) {}

    public record Share(@NotNull UUID accountId, @Positive @Max(1_000_000) Long weight) {}

    /** Split an expense across member pots by weight (default 1 each) with largest-remainder rounding. */
    public record SplitRequest(
            UUID expenseAccountId,
            @Positive @Max(MAX_AMOUNT) long totalMinor,
            @NotBlank @Size(max = 500) String description,
            @NotEmpty @Size(max = 50) List<@Valid Share> shares) {}

    public record ReverseRequest(@Size(max = 300) String reason) {}

    public record SplitResult(EntryView entry, List<Allocation> allocations) {
        public record Allocation(UUID accountId, long shareMinor) {}
    }

    /** status POSTED (entry set, HTTP 201) or PENDING_APPROVAL (approval set, no ledger entry yet, HTTP 202). */
    public record SpendResult(String status, EntryView entry, ApprovalView approval) {}
}
