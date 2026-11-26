package com.personalplatform.waitingon.inbound.smtp;

import java.net.InetSocketAddress;
import java.net.SocketAddress;
import java.time.Clock;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.subethamail.smtp.server.Session;
import org.subethamail.smtp.server.SessionHandler;

/**
 * Abuse limits for the SMTP listener, per source IP and per connection:
 * <ul>
 *   <li>at connect: concurrent connections per IP and new connections per IP per minute (421 when exceeded);</li>
 *   <li>at MAIL FROM: messages per IP per hour and per connection (421 and hang up);</li>
 *   <li>at RCPT TO: refused recipients per connection; past the limit the connection is dropped, which makes guessing
 *       reply tokens slow on top of their 80 bits.</li>
 * </ul>
 * Total connections and idle timeout are enforced by the server itself.
 */
final class SmtpLimits implements SessionHandler {

    /** Per-connection counters. */
    final class Connection {
        private int messages;
        private int refused;

        /** False once this connection has started its maximum number of mail transactions. */
        synchronized boolean tryStartMessage() {
            return ++messages <= props.maxMessagesPerConnection();
        }

        /** Counts a refused RCPT TO; true when the connection has now used up its allowance and should be dropped. */
        synchronized boolean refusedRecipient() {
            return ++refused >= props.maxRefusedRecipientsPerConnection();
        }
    }

    private final InboundSmtpProperties props;
    private final WindowCounter connectionsPerMinute;
    private final WindowCounter messagesPerHour;
    private final Map<String, Integer> concurrent = new ConcurrentHashMap<>();
    private final Map<String, Connection> connections = new ConcurrentHashMap<>();

    SmtpLimits(InboundSmtpProperties props, Clock clock) {
        this.props = props;
        this.connectionsPerMinute = new WindowCounter(props.maxConnectionsPerIpPerMinute(), Duration.ofMinutes(1), clock);
        this.messagesPerHour = new WindowCounter(props.maxMessagesPerIpPerHour(), Duration.ofHours(1), clock);
    }

    static String ipOf(SocketAddress address) {
        if (address instanceof InetSocketAddress inet && inet.getAddress() != null) {
            return inet.getAddress().getHostAddress();
        }
        return String.valueOf(address);
    }

    @Override
    public SessionAcceptance accept(Session session) {
        String ip = ipOf(session.getRealRemoteAddress());
        if (!connectionsPerMinute.tryAcquire(ip)) {
            return SessionAcceptance.failure(421, "4.7.0 Too many connections from your address, try again later");
        }
        int now = concurrent.merge(ip, 1, Integer::sum);
        if (now > props.maxConcurrentPerIp()) {
            concurrent.computeIfPresent(ip, (k, v) -> v <= 1 ? null : v - 1);
            return SessionAcceptance.failure(421, "4.7.0 Too many concurrent connections from your address");
        }
        connections.put(session.getSessionId(), new Connection());
        return SessionAcceptance.success();
    }

    @Override
    public void onSessionEnd(Session session) {
        // only sessions this handler accepted hold a concurrency slot
        if (connections.remove(session.getSessionId()) != null) {
            concurrent.computeIfPresent(ipOf(session.getRealRemoteAddress()), (k, v) -> v <= 1 ? null : v - 1);
        }
    }

    /** The state of an accepted connection (a fresh, untracked one if the session is unknown; should not happen). */
    Connection connection(String sessionId) {
        Connection c = connections.get(sessionId);
        return c != null ? c : new Connection();
    }

    boolean tryMessageFrom(String ip) {
        return messagesPerHour.tryAcquire(ip);
    }
}
