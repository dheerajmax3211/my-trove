package com.personalplatform.legacy.trustee;

import com.personalplatform.legacy.protocol.Contact;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** A trustee as stored. {@code sealedShare} is an opaque envelope; digests, never raw tokens, are persisted. */
public record TrusteeRow(
        UUID id,
        UUID vaultId,
        String label,
        TrusteeStatus status,
        Instant inviteExpiresAt,
        Instant inviteUsedAt,
        String keyAlgorithm,
        byte[] publicKey,
        String keyFingerprint,
        List<Contact> contacts,
        String sealedShare,
        byte[] shareSha256,
        Integer shareVaultVersion,
        Instant shareUploadedAt,
        Instant shareConfirmedAt,
        Instant acceptedAt,
        Instant revokedAt,
        Instant createdAt) {

    public boolean active() {
        return status != TrusteeStatus.REVOKED;
    }

    /** Holds a sealed share for the given vault key version, i.e. can actually help reconstruct. */
    public boolean holdsShareFor(int vaultVersion) {
        return (status == TrusteeStatus.SHARE_UPLOADED || status == TrusteeStatus.CONFIRMED)
                && sealedShare != null
                && shareVaultVersion != null
                && shareVaultVersion == vaultVersion;
    }
}
