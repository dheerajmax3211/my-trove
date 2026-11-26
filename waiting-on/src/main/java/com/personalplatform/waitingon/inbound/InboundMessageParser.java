package com.personalplatform.waitingon.inbound;

import jakarta.mail.Address;
import jakarta.mail.BodyPart;
import jakarta.mail.MessagingException;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.util.Properties;

/**
 * Raw RFC 5322 message (as received over SMTP) to the fields the reply pipeline needs. Body: the first
 * {@code text/plain} part that is not an attachment; failing that, the first {@code text/html} part converted to text.
 * Then quoted history and signatures are stripped ({@link QuotedReplyStripper}) and the length is capped.
 */
public final class InboundMessageParser {

    private static final int MAX_DEPTH = 8;
    private static final int MAX_PARTS = 50;
    private static final int MAX_TEXT_BYTES = 1 << 20;
    private static final Session SESSION = Session.getInstance(new Properties());

    public record ParsedReply(String from, String subject, String messageId, String text) {
    }

    private InboundMessageParser() {
    }

    /**
     * @param envelopeFrom MAIL FROM of the SMTP transaction, used when the message has no usable From header
     * @throws MessagingException when the bytes are not a parseable message
     */
    public static ParsedReply parse(byte[] raw, String envelopeFrom) throws MessagingException, IOException {
        MimeMessage msg = new MimeMessage(SESSION, new ByteArrayInputStream(raw));
        Bodies bodies = new Bodies();
        collect(msg, bodies, 0);
        String text = bodies.plain != null && !bodies.plain.isBlank() ? bodies.plain
                : bodies.html != null ? HtmlText.toText(bodies.html) : "";
        return new ParsedReply(sender(msg, envelopeFrom), msg.getSubject(), msg.getMessageID(),
                QuotedReplyStripper.strip(text));
    }

    private static String sender(MimeMessage msg, String envelopeFrom) {
        try {
            Address[] from = msg.getFrom();
            if (from != null && from.length > 0 && from[0] instanceof InternetAddress ia && ia.getAddress() != null) {
                return ia.getAddress();
            }
        } catch (MessagingException e) {
            // malformed From header: fall back to the envelope sender
        }
        return envelopeFrom == null || envelopeFrom.isBlank() ? null : envelopeFrom;
    }

    private static final class Bodies {
        String plain;
        String html;
        int parts;
    }

    private static void collect(Part part, Bodies out, int depth) throws MessagingException, IOException {
        if (depth > MAX_DEPTH || ++out.parts > MAX_PARTS || (out.plain != null && out.html != null)) {
            return;
        }
        if (Part.ATTACHMENT.equalsIgnoreCase(part.getDisposition())) {
            return;
        }
        if (part.isMimeType("multipart/*")) {
            Multipart mp = (Multipart) part.getContent();
            for (int i = 0; i < mp.getCount(); i++) {
                BodyPart child = mp.getBodyPart(i);
                collect(child, out, depth + 1);
            }
        } else if (part.isMimeType("text/plain") && out.plain == null) {
            out.plain = asString(part);
        } else if (part.isMimeType("text/html") && out.html == null) {
            out.html = asString(part);
        }
    }

    private static String asString(Part part) throws MessagingException, IOException {
        try {
            Object content = part.getContent();
            return content instanceof String s ? s : null;
        } catch (UnsupportedEncodingException e) { // unknown charset label: keep the bytes rather than drop the reply
            try (InputStream in = part.getInputStream()) {
                return new String(in.readNBytes(MAX_TEXT_BYTES), StandardCharsets.ISO_8859_1);
            }
        }
    }
}
