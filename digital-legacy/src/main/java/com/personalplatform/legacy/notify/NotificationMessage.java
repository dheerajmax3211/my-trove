package com.personalplatform.legacy.notify;

import com.personalplatform.legacy.protocol.Urgency;
import java.util.UUID;

/** What a recipient is told. Deliberately contains no vault content, key material or share data. */
public record NotificationMessage(
        UUID vaultId, NotificationKind kind, Urgency urgency, String recipientKind, String subject, String body) {}
