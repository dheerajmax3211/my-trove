package com.personalplatform.waitingon.inbound.smtp;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.unit.DataSize;

/**
 * The built-in SMTP listener that receives replies sent to the per-item reply addresses. Off by default.
 *
 * @param enabled                          start the listener ({@code INBOUND_SMTP_ENABLED})
 * @param port                             TCP port ({@code INBOUND_SMTP_PORT}, default 2525; 0 = any free port)
 * @param bindAddress                      interface to listen on ({@code INBOUND_SMTP_BIND_ADDRESS}, default
 *                                         127.0.0.1; containers set 0.0.0.0)
 * @param hostName                         name announced in the greeting
 * @param maxMessageSize                   larger messages are refused with 552 (default 512KB)
 * @param connectionTimeout                idle time before the server hangs up
 * @param maxConnections                   concurrent connections, all sources
 * @param maxConcurrentPerIp               concurrent connections from one IP
 * @param maxConnectionsPerIpPerMinute     new connections from one IP per minute
 * @param maxMessagesPerIpPerHour          accepted mail transactions from one IP per hour
 * @param maxMessagesPerConnection         mail transactions on one connection
 * @param maxRefusedRecipientsPerConnection refused RCPT TOs before the connection is dropped (slows address guessing)
 */
@ConfigurationProperties(prefix = "app.inbound.smtp")
public record InboundSmtpProperties(
        boolean enabled,
        Integer port,
        String bindAddress,
        String hostName,
        DataSize maxMessageSize,
        Duration connectionTimeout,
        Integer maxConnections,
        Integer maxConcurrentPerIp,
        Integer maxConnectionsPerIpPerMinute,
        Integer maxMessagesPerIpPerHour,
        Integer maxMessagesPerConnection,
        Integer maxRefusedRecipientsPerConnection) {

    public InboundSmtpProperties {
        port = port == null ? 2525 : port;
        bindAddress = bindAddress == null || bindAddress.isBlank() ? "127.0.0.1" : bindAddress;
        hostName = hostName == null || hostName.isBlank() ? "waiting-on" : hostName;
        maxMessageSize = maxMessageSize == null ? DataSize.ofKilobytes(512) : maxMessageSize;
        connectionTimeout = connectionTimeout == null ? Duration.ofSeconds(60) : connectionTimeout;
        maxConnections = positive(maxConnections, 50);
        maxConcurrentPerIp = positive(maxConcurrentPerIp, 3);
        maxConnectionsPerIpPerMinute = positive(maxConnectionsPerIpPerMinute, 30);
        maxMessagesPerIpPerHour = positive(maxMessagesPerIpPerHour, 60);
        maxMessagesPerConnection = positive(maxMessagesPerConnection, 5);
        maxRefusedRecipientsPerConnection = positive(maxRefusedRecipientsPerConnection, 3);
        if (port < 0 || port > 65_535) {
            throw new IllegalArgumentException("app.inbound.smtp.port must be 0..65535");
        }
    }

    private static int positive(Integer value, int fallback) {
        return value == null || value <= 0 ? fallback : value;
    }
}
