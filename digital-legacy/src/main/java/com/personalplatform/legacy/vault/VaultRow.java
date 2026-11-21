package com.personalplatform.legacy.vault;

import com.personalplatform.legacy.protocol.PauseLedger;
import com.personalplatform.legacy.protocol.SwitchPolicy;
import com.personalplatform.legacy.protocol.SwitchSnapshot;
import com.personalplatform.legacy.protocol.SwitchState;
import java.time.Instant;
import java.util.UUID;

/** A vault without its ciphertext blob (which can be large and is not needed for protocol work). */
public record VaultRow(
        UUID id,
        String ownerUid,
        SwitchState state,
        boolean armed,
        int epoch,
        SwitchPolicy policy,
        Instant lastCheckinAt,
        Instant nextDueAt,
        Instant stateEnteredAt,
        int stepsExecuted,
        Instant quorumReachedAt,
        Instant pausedUntil,
        Instant pauseWindowStart,
        long pauseUsedSeconds,
        Instant nextActionAt,
        int vaultVersion,
        int contentRevision,
        byte[] ciphertextSha256,
        int ciphertextBytes,
        String metadataJson,
        Instant releasedAt,
        Instant createdAt,
        Instant updatedAt) {

    public SwitchSnapshot snapshot() {
        return new SwitchSnapshot(state, nextDueAt, pausedUntil, stateEnteredAt, stepsExecuted, quorumReachedAt);
    }

    public PauseLedger ledger() {
        return new PauseLedger(pauseWindowStart, pauseUsedSeconds);
    }

    public VaultRow with(SwitchSnapshot s, int newEpoch) {
        return new VaultRow(id, ownerUid, s.state(), armed, newEpoch, policy, lastCheckinAt, s.nextDueAt(),
                s.enteredAt(), s.stepsExecuted(), s.quorumReachedAt(), s.pausedUntil(), pauseWindowStart,
                pauseUsedSeconds, nextActionAt, vaultVersion, contentRevision, ciphertextSha256, ciphertextBytes,
                metadataJson, s.state() == SwitchState.RELEASED && releasedAt == null ? s.enteredAt() : releasedAt,
                createdAt, updatedAt);
    }

    public VaultRow with(PauseLedger ledger) {
        return new VaultRow(id, ownerUid, state, armed, epoch, policy, lastCheckinAt, nextDueAt, stateEnteredAt,
                stepsExecuted, quorumReachedAt, pausedUntil, ledger.windowStart(), ledger.usedSeconds(),
                nextActionAt, vaultVersion, contentRevision, ciphertextSha256, ciphertextBytes, metadataJson,
                releasedAt, createdAt, updatedAt);
    }

    public VaultRow withArmed(boolean newArmed, Instant newLastCheckin) {
        return new VaultRow(id, ownerUid, state, newArmed, epoch, policy, newLastCheckin, nextDueAt,
                stateEnteredAt, stepsExecuted, quorumReachedAt, pausedUntil, pauseWindowStart, pauseUsedSeconds,
                nextActionAt, vaultVersion, contentRevision, ciphertextSha256, ciphertextBytes, metadataJson,
                releasedAt, createdAt, updatedAt);
    }

    public VaultRow withLastCheckin(Instant at) {
        return withArmed(armed, at);
    }

    public VaultRow withPolicy(SwitchPolicy newPolicy) {
        return new VaultRow(id, ownerUid, state, armed, epoch, newPolicy, lastCheckinAt, nextDueAt, stateEnteredAt,
                stepsExecuted, quorumReachedAt, pausedUntil, pauseWindowStart, pauseUsedSeconds, nextActionAt,
                vaultVersion, contentRevision, ciphertextSha256, ciphertextBytes, metadataJson, releasedAt,
                createdAt, updatedAt);
    }
}
