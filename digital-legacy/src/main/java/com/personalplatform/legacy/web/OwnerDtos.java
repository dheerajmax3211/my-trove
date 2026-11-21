package com.personalplatform.legacy.web;

import com.personalplatform.legacy.protocol.SwitchPolicy;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Request/response shapes of the owner API. Binary values are standard Base64 strings. */
public final class OwnerDtos {

    private OwnerDtos() {}

    public record CreateVaultRequest(@NotBlank String ciphertext, @NotNull Map<String, Object> metadata) {}

    public record UpdateVaultRequest(
            @NotBlank String ciphertext, @NotNull Map<String, Object> metadata, boolean keyRotated) {}

    public record VaultSummary(
            UUID id,
            String state,
            boolean armed,
            int vaultVersion,
            int contentRevision,
            int ciphertextBytes,
            String ciphertextSha256,
            Map<String, Object> metadata,
            boolean hasPolicy,
            Instant createdAt,
            Instant updatedAt) {}

    public record CiphertextView(String ciphertext, Map<String, Object> metadata, int vaultVersion, String sha256) {}

    public record InviteRequest(@NotBlank @Size(max = 100) String label) {}

    public record InviteResponse(UUID trusteeId, String label, String inviteToken, Instant inviteExpiresAt) {}

    public record TrusteeView(
            UUID id,
            String label,
            String status,
            String keyAlgorithm,
            String publicKey,
            String keyFingerprint,
            boolean shareUploaded,
            Integer shareVaultVersion,
            boolean shareCurrent,
            boolean shareConfirmed,
            Instant acceptedAt,
            Instant inviteExpiresAt) {}

    public record ShareUpload(@NotNull Map<String, Object> sealedShare, int vaultVersion) {}

    public record PauseRequest(@Min(1) @Max(Integer.MAX_VALUE) long durationSeconds) {}

    public record StateView(
            String state,
            boolean armed,
            int epoch,
            Instant lastCheckInAt,
            Instant nextDueAt,
            Instant pausedUntil,
            Instant stateEnteredAt,
            Instant nextActionAt,
            Instant releasedAt,
            Escalation escalation,
            Quorum quorum,
            Pause pause,
            Readiness readiness,
            SwitchPolicy policy) {}

    public record Escalation(int stepsExecuted, int totalSteps) {}

    public record Quorum(
            int required, int approved, int declined, int trusteesActive, int trusteesHoldingShare,
            Instant quorumReachedAt, Instant releaseNotBefore) {}

    public record Pause(long usedSeconds, long yearlyBudgetSeconds, long maxSingleSeconds) {}

    public record Readiness(boolean armable, List<String> problems) {}

    public record TimelineEntry(long seq, Instant at, String actorKind, String eventType, Map<String, Object> detail) {}

    public record ChainView(boolean intact, long length, String headHash, Long firstBadSeq) {}
}
