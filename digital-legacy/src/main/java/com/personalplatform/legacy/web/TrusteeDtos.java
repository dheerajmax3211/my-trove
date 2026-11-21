package com.personalplatform.legacy.web;

import com.personalplatform.legacy.protocol.Contact;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Request/response shapes of the trustee API. */
public final class TrusteeDtos {

    private TrusteeDtos() {}

    public record AcceptRequest(
            @NotBlank String inviteToken,
            @NotBlank String keyAlgorithm,
            @NotBlank String publicKey,
            @NotEmpty @Valid List<Contact> contacts) {}

    /** The access token is shown exactly once; only its digest is stored. */
    public record AcceptResponse(
            UUID trusteeId, UUID vaultId, String accessToken, String keyFingerprint, String scheme) {}

    /** Trustees see a deliberately coarse phase, not the owner's missed-check-in details. */
    public record TrusteeStateView(
            UUID trusteeId,
            UUID vaultId,
            String label,
            String status,
            String phase,
            int approvalsRequired,
            boolean shareUploaded,
            String shareDigest,
            Integer shareVaultVersion,
            String myDecision,
            String keyFingerprint) {}

    public record ConfirmRequest(@NotBlank String shareDigest) {}

    public record VoteRequest(@NotNull Decision decision) {}

    public enum Decision {
        APPROVE,
        DECLINE
    }

    public record VoteResponse(String decision, String phase, boolean changed) {}

    public record ShareView(UUID vaultId, UUID trusteeId, int vaultVersion, Map<String, Object> sealedShare) {}

    public record CiphertextView(
            UUID vaultId, int vaultVersion, String ciphertext, Map<String, Object> metadata, String sha256) {}

    public record ReleasedAt(Instant at) {}
}
