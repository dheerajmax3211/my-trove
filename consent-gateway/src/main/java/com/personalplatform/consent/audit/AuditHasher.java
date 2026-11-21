package com.personalplatform.consent.audit;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;

/**
 * SHA-256 over an unambiguous encoding of an entry: every field is written as {@code <length>:<value>} (null as
 * {@code -}), so no two different entries can serialise to the same bytes.
 */
public final class AuditHasher {

    public static final String GENESIS = "0".repeat(64);

    private AuditHasher() {}

    public static String hash(
            String prevHash,
            String ownerUid,
            long ownerSeq,
            String eventType,
            String actorType,
            String actorId,
            String clientId,
            String grantId,
            String detail,
            Instant occurredAt) {
        StringBuilder sb = new StringBuilder(256);
        field(sb, prevHash);
        field(sb, ownerUid);
        field(sb, Long.toString(ownerSeq));
        field(sb, eventType);
        field(sb, actorType);
        field(sb, actorId);
        field(sb, clientId);
        field(sb, grantId);
        field(sb, detail);
        field(sb, occurredAt.getEpochSecond() + "." + occurredAt.getNano());
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(sb.toString().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void field(StringBuilder sb, String value) {
        if (value == null) {
            sb.append("-;");
        } else {
            sb.append(value.length()).append(':').append(value).append(';');
        }
    }
}
