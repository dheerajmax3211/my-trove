package com.personalplatform.waitingon.inbound.smtp;

import com.personalplatform.waitingon.inbound.InboundEmailService;
import com.personalplatform.waitingon.inbound.ReplyAddresses;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.time.Clock;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;
import org.subethamail.smtp.server.SMTPServer;

/**
 * Runs the SubEthaSMTP listener for the lifetime of the application context. Receive-only: no AUTH, no relaying
 * (every recipient that is not an open item's reply address is refused at RCPT TO), one recipient per message, no
 * STARTTLS (put an MX / relay that terminates TLS in front in production, see README).
 */
public class InboundSmtpServer implements SmartLifecycle {

    private static final Logger LOG = LoggerFactory.getLogger(InboundSmtpServer.class);

    private final InboundSmtpProperties props;
    private final InboundEmailService service;
    private final ReplyAddresses addresses;
    private final Clock clock;
    private SMTPServer server;

    public InboundSmtpServer(InboundSmtpProperties props, InboundEmailService service, ReplyAddresses addresses,
            Clock clock) {
        this.props = props;
        this.service = service;
        this.addresses = addresses;
        this.clock = clock;
    }

    @Override
    public synchronized void start() {
        if (server != null) {
            return;
        }
        int maxBytes = Math.toIntExact(props.maxMessageSize().toBytes());
        SmtpLimits limits = new SmtpLimits(props, clock);
        InetAddress bind;
        try {
            bind = InetAddress.getByName(props.bindAddress());
        } catch (UnknownHostException e) {
            throw new IllegalStateException("app.inbound.smtp.bind-address is not a valid address: " + props.bindAddress(), e);
        }
        server = SMTPServer.port(props.port())
                .bindAddress(bind)
                .hostName(props.hostName())
                .softwareName("waiting-on")
                .maxConnections(props.maxConnections())
                .connectionTimeout(Math.toIntExact(props.connectionTimeout().toMillis()), TimeUnit.MILLISECONDS)
                .maxRecipients(1)
                .maxMessageSize(maxBytes)
                .sessionHandler(limits)
                .messageHandlerFactory(ctx -> new ReplyMessageHandler(service, addresses, limits,
                        limits.connection(ctx.getSessionId()), SmtpLimits.ipOf(ctx.getRemoteAddress()), maxBytes))
                .serverThreadName("inbound-smtp")
                .build();
        server.start();
        LOG.info("Inbound SMTP listening on {}:{} (max message {} bytes)", props.bindAddress(), port(), maxBytes);
    }

    @Override
    public synchronized void stop() {
        if (server != null) {
            server.stop();
            server = null;
        }
    }

    @Override
    public synchronized boolean isRunning() {
        return server != null && server.isRunning();
    }

    /** The bound port (useful with {@code port=0}); -1 when not running. */
    public synchronized int port() {
        return server == null ? -1 : server.getPortAllocated();
    }
}
