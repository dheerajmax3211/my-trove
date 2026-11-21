package com.personalplatform.treasury.household;

/** Household roles. OWNER manages the household; APPROVER decides approvals; MEMBER spends; KID only touches their own pot. */
public enum Role {
    OWNER, APPROVER, MEMBER, KID;

    /** May decide approval requests (a requester can never decide their own). */
    public boolean canApprove() {
        return this == OWNER || this == APPROVER;
    }

    /** May move money out of household-level accounts via transfers, reverse entries and run reports. */
    public boolean isTrusted() {
        return this == OWNER || this == APPROVER;
    }
}
