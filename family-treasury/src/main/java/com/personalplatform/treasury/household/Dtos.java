package com.personalplatform.treasury.household;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Request/response records for household, member and account endpoints. Money is always long minor units. */
public final class Dtos {

    private Dtos() {}

    public static final long MAX_AMOUNT = 999_999_999_999_999L;

    public record CreateHouseholdRequest(
            @NotBlank @Size(max = 200) String name,
            @NotBlank @Pattern(regexp = "[A-Z]{3}") String currency,
            @Min(0) @Max(MAX_AMOUNT) Long approvalThresholdMinor,
            @Min(1) @Max(8760) Integer approvalExpiryHours) {}

    public record UpdateSettingsRequest(
            @Min(0) @Max(MAX_AMOUNT) Long approvalThresholdMinor,
            @NotNull @Min(1) @Max(8760) Integer approvalExpiryHours) {}

    public record AddMemberRequest(
            @NotBlank @Size(max = 128) String uid,
            @NotNull Role role,
            @Size(max = 200) String displayName) {}

    public record ChangeRoleRequest(@NotNull Role role) {}

    public record CreateAccountRequest(
            @NotBlank @Size(max = 160) String code,
            @NotBlank @Size(max = 200) String name,
            @NotNull AccountType type,
            @Pattern(regexp = "[A-Z]{3}") String currency,
            @Size(max = 128) String ownerUid,
            Boolean allowNegative) {}

    public record MemberView(String uid, Role role, String displayName) {}

    public record AccountView(
            UUID id, String code, String name, AccountType type, String currency, String ownerUid,
            boolean allowNegative, long balanceMinor, long rawBalanceMinor) {}

    public record HouseholdView(
            UUID id, String name, String currency, Long approvalThresholdMinor, int approvalExpiryHours,
            Instant createdAt, List<MemberView> members, List<AccountView> accounts) {}

}
