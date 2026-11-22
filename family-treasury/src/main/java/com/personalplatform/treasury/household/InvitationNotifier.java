package com.personalplatform.treasury.household;

import java.time.Instant;
import java.util.UUID;

/**
 * Where email invitations are delivered. A code-only invite never touches this. An invite created with a recipient
 * address is handed here once, right after it is stored, in the same transaction: if the hand-off fails the invite is
 * rolled back and the owner is told. The notification service supplies the implementation; until one is registered an
 * email invite is refused before anything is stored.
 */
public interface InvitationNotifier {

    void invitationCreated(EmailInvitation invitation);

    /** Everything a delivery needs. {@code code} is the one-time join code the recipient types in; it is never stored in clear. */
    record EmailInvitation(
            UUID householdId, UUID inviteId, Role role, String recipientEmail, String code, Instant expiresAt) {}
}
