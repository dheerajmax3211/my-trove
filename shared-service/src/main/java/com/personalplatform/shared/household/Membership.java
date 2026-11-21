package com.personalplatform.shared.household;

import java.util.UUID;

/** Proof that {@code uid} belongs to {@code householdId} with {@code role}. */
public record Membership(UUID householdId, String uid, Role role) {}
