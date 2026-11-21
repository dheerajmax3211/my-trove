package com.personalplatform.treasury.household;

import java.util.UUID;

/** Small internal read models shared by the services. */
public final class Rows {

    private Rows() {}

    public record Member(UUID householdId, String uid, Role role) {}

    public record HouseholdRow(UUID id, String name, String currency, Long approvalThreshold, int approvalExpiryHours) {}

    public record AccountRow(UUID id, UUID householdId, String ownerUid, String code, String name, AccountType type,
                             String currency, boolean allowNegative) {}
}
