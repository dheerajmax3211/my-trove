package com.personalplatform.waitingon.inbound.smtp;

import com.personalplatform.waitingon.inbound.InboundEmailService;
import com.personalplatform.waitingon.inbound.InboundEmailService.InboundEmail;
import com.personalplatform.waitingon.inbound.InboundMessageParser;
import com.personalplatform.waitingon.inbound.InboundMessageParser.ParsedReply;
import com.personalplatform.waitingon.inbound.ReplyAddresses;
import jakarta.mail.MessagingException;
import java.io.IOException;
import java.io.InputStream;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.subethamail.smtp.DropConnectionException;
import org.subethamail.smtp.MessageHandler;
import org.subethamail.smtp.RejectException;

/**
 * One SMTP mail transaction. Every check happens as early as the protocol allows: rate limits at MAIL FROM, the
 * recipient at RCPT TO (only open items' reply addresses; anything else is 550, so this is never a relay), size while
 * reading DATA. The accepted message goes to {@link InboundEmailService#handle}, the same pipeline as the webhook.
 */
final class ReplyMessageHandler implements MessageHandler {

    private static final Logger LOG = LoggerFactory.getLogger(ReplyMessageHandler.class);

    private static final long MAX_DRAIN_BYTES = 16L << 20;

    static final String REFUSED = "5.1.1 No such reply address here";

    private final InboundEmailService service;
    private final ReplyAddresses addresses;
    private final SmtpLimits limits;
    private final SmtpLimits.Connection connection;
    private final String ip;
    private final int maxMessageBytes;

    private String envelopeFrom;
    private String recipient;

    ReplyMessageHandler(InboundEmailService service, ReplyAddresses addresses, SmtpLimits limits,
            SmtpLimits.Connection connection, String ip, int maxMessageBytes) {
        this.service = service;
        this.addresses = addresses;
        this.limits = limits;
        this.connection = connection;
        this.ip = ip;
        this.maxMessageBytes = maxMessageBytes;
    }

    @Override
    public void from(String from) throws RejectException {
        if (!connection.tryStartMessage()) {
            throw new DropConnectionException(421, "4.7.0 Too many messages on one connection, reconnect later");
        }
        if (!limits.tryMessageFrom(ip)) {
            throw new DropConnectionException(421, "4.7.0 Too many messages from your address, try again later");
        }
        this.envelopeFrom = from;
    }

    @Override
    public void recipient(String rcpt) throws RejectException {
        if (recipient != null) {
            throw new RejectException(452, "4.5.3 Only one recipient per message");
        }
        Optional<String> token = addresses.tokenForRecipient(rcpt);
        if (token.isEmpty() || !service.acceptsRepliesFor(token.get())) {
            if (connection.refusedRecipient()) {
                throw new DropConnectionException(550, REFUSED + " (closing connection)");
            }
            throw new RejectException(550, REFUSED);
        }
        this.recipient = rcpt;
    }

    @Override
    public String data(InputStream data) throws RejectException, IOException {
        byte[] raw = data.readNBytes(maxMessageBytes + 1);
        if (raw.length > maxMessageBytes) {
            // The library does not drain DATA after a rejection, so discard the rest here (bounded) to keep the
            // conversation in sync; a sender that keeps going past the bound is cut off.
            String reply = "5.3.4 Message too big (limit " + maxMessageBytes + " bytes)";
            if (!drained(data)) {
                throw new DropConnectionException(552, reply);
            }
            throw new RejectException(552, reply);
        }
        ParsedReply parsed;
        try {
            parsed = InboundMessageParser.parse(raw, envelopeFrom);
        } catch (MessagingException | RuntimeException e) {
            throw new RejectException(554, "5.6.0 Message could not be parsed");
        }
        try {
            service.handle(new InboundEmail(parsed.from(), recipient, parsed.subject(), parsed.text(),
                    parsed.messageId()));
        } catch (RuntimeException e) {
            // e.g. Temporal unreachable: the event was rolled back, so a temporary failure makes the sender retry
            LOG.warn("Inbound SMTP reply could not be applied, answered 451 so the sender retries", e);
            throw new RejectException(451, "4.3.0 Temporary failure, please try again later");
        }
        return null;
    }

    /** Reads and discards up to {@link #MAX_DRAIN_BYTES}; true when the end of DATA was reached. */
    private static boolean drained(InputStream data) throws IOException {
        byte[] buf = new byte[8192];
        long total = 0;
        int n;
        while ((n = data.read(buf)) != -1) {
            total += n;
            if (total > MAX_DRAIN_BYTES) {
                return false;
            }
        }
        return true;
    }

    @Override
    public void done() {
        // nothing held per transaction
    }
}
