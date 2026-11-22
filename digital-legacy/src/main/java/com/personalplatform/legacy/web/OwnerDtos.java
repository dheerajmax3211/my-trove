package com.personalplatform.legacy.web;

import com.personalplatform.legacy.protocol.SwitchPolicy;
import jakarta.validation.constraints.Email;
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

    /** {@code exists} is false (and the rest empty) when the caller has no vault yet: a normal state, not an error. */
    public record VaultSummary(
            UUID id,
            boolean exists,
            String state,
            boolean armed,
            int vaultVersion,
            int contentRevision,
            int ciphertextBytes,
            String ciphertextSha256,
            Map<String, Object> metadata,
            boolean hasPolicy,
            Instant createdAt,
            Instant updatedAt) {

        public static VaultSummary absent() {
            return new VaultSummary(null, false, NO_VAULT, false, 0, 0, 0, null, Map.of(), false, null, null);
        }
    }

    /** The state name the owner reads while no vault exists. */
    public static final String NO_VAULT = "NONE";

    public record CiphertextView(String ciphertext, Map<String, Object> metadata, int vaultVersion, String sha256) {

        public static CiphertextView absent() {
            return new CiphertextView(null, Map.of(), 0, null);
        }
    }

    /** email is optional: when given, the invite link is emailed to that address (the owner need not pass it on). */
    public record InviteRequest(@NotBlank @Size(max = 100) String label, @Email @Size(max = 320) String email) {}

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
            SwitchPolicy policy) {

        /** The switch as an owner without a vault sees it: nothing armed, nothing due, no policy. */
        public static StateView absent() {
            return new StateView(NO_VAULT, false, 0, null, null, null, null, null, null,
                    new Escalation(0, 0), new Quorum(0, 0, 0, 0, 0, null, null), new Pause(0, 0, 0),
                    new Readiness(false, List.of("no vault yet")), null);
        }
    }

    public record Escalation(int stepsExecuted, int totalSteps) {}

    public record Quorum(
            int required, int approved, int declined, int trusteesActive, int trusteesHoldingShare,
            Instant quorumReachedAt, Instant releaseNotBefore) {}

    public record Pause(long usedSeconds, long yearlyBudgetSeconds, long maxSingleSeconds) {}

    public record Readiness(boolean armable, List<String> problems) {}

    public record TimelineEntry(long seq, Instant at, String actorKind, String eventType, Map<String, Object> detail) {}

    public record ChainView(boolean intact, long length, String headHash, Long firstBadSeq) {

        /** An owner without a vault has an empty chain, which is intact by definition. */
        public static ChainView empty() {
            return new ChainView(true, 0, null, null);
        }
    }
}
