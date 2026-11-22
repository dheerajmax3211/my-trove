package com.personalplatform.notify;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * One notification to enqueue. Write it in the same transaction as the business change that caused it, with
 * {@link NotificationOutbox#enqueue}; the relay delivers it afterwards.
 *
 * @param recipientUid   platform user to show it to, or null for an address that is not a platform user
 * @param recipientEmail explicit address, or null to use the address on file for {@code recipientUid}
 * @param kind           stable machine name, for example {@code REMINDER} or {@code CONSENT_REQUEST}
 * @param source         the service that produced it, for example {@code waiting-on}
 * @param title          subject line and inbox title
 * @param body           plain text; cleared once an email-only notification has been sent or dead-lettered
 * @param link           path inside the workspace (for example {@code /consent}), or null
 * @param replyTo        reply address (plus-address for inbound replies), or null
 * @param inApp          whether it appears in the recipient's inbox
 * @param dedupeKey      stable key: enqueuing the same key twice stores one notification
 */
public record Notification(
        String recipientUid,
        String recipientEmail,
        String kind,
        String source,
        String title,
        String body,
        String link,
        String replyTo,
        boolean inApp,
        String dedupeKey) {

    public Notification {
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("title is required");
        }
        if (kind == null || kind.isBlank()) {
            throw new IllegalArgumentException("kind is required");
        }
        if (source == null || source.isBlank()) {
            throw new IllegalArgumentException("source is required");
        }
        if (dedupeKey == null || dedupeKey.isBlank()) {
            throw new IllegalArgumentException("dedupeKey is required");
        }
        if (recipientUid == null && recipientEmail == null) {
            throw new IllegalArgumentException("a notification needs a recipient uid or an email address");
        }
        if (recipientUid == null && inApp) {
            throw new IllegalArgumentException("only platform users have an inbox");
        }
    }

    /** For a platform user: shown in their inbox and emailed to the address on file. */
    public static Notification toUser(String uid, String kind, String source, String title, String body, String link,
            String dedupeKey) {
        return new Notification(uid, null, kind, source, title, body, link, null, true, dedupeKey);
    }

    /** For someone who is not a platform user (a counterparty, a trustee): email only, nothing in any inbox. */
    public static Notification toAddress(String email, String kind, String source, String title, String body,
            String replyTo, String dedupeKey) {
        return new Notification(null, email, kind, source, title, body, null, replyTo, false, dedupeKey);
    }

    /** A stable key from its parts: the same parts always give the same key, so retries cannot enqueue twice. */
    public static String dedupeKey(String... parts) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (String p : parts) {
                digest.update((p == null ? "\u0000" : p).getBytes(StandardCharsets.UTF_8));
                digest.update((byte) '|');
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is required by every JVM", e);
        }
    }
}
