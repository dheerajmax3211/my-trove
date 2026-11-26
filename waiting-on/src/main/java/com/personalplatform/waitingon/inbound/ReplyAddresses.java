package com.personalplatform.waitingon.inbound;

import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/** Builds and parses the per-item plus-address {@code waiting+<token>@domain}. */
@Component
public class ReplyAddresses {

    private static final Pattern TOKEN = Pattern.compile("(?i)\\bwaiting\\+([a-f0-9]{20})@");
    private static final Pattern EXACT = Pattern.compile("(?i)waiting\\+([a-f0-9]{20})@([a-z0-9.-]{1,253})");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final InboundProperties props;

    public ReplyAddresses(InboundProperties props) {
        this.props = props;
    }

    /** 80 bits of randomness: unguessable, and short enough for an email local part. */
    public static String newToken() {
        byte[] bytes = new byte[10];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    public String addressFor(String token) {
        return "waiting+" + token + "@" + props.replyDomain();
    }

    /**
     * Strict form for an SMTP envelope recipient: the whole address must be {@code waiting+<token>@<replyDomain>}
     * (case-insensitive). Anything else (another domain, another local part, a display name) is not ours.
     */
    public Optional<String> tokenForRecipient(String address) {
        if (address == null) {
            return Optional.empty();
        }
        Matcher m = EXACT.matcher(address.strip());
        if (!m.matches() || !m.group(2).equalsIgnoreCase(props.replyDomain())) {
            return Optional.empty();
        }
        return Optional.of(m.group(1).toLowerCase(java.util.Locale.ROOT));
    }

    /** Finds the first plus-address token in a (possibly multi-recipient, possibly "Name &lt;addr&gt;") header. */
    public static Optional<String> extractToken(String toHeader) {
        if (toHeader == null) {
            return Optional.empty();
        }
        Matcher m = TOKEN.matcher(toHeader);
        return m.find() ? Optional.of(m.group(1).toLowerCase(java.util.Locale.ROOT)) : Optional.empty();
    }
}
