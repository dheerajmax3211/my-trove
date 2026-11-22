package com.personalplatform.notify;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Email settings, bound from {@code app.mail.*}.
 *
 * @param enabled       true sends email over SMTP; false logs what would be sent (the default outside dev)
 * @param host          SMTP host (Mailpit in dev: localhost)
 * @param port          SMTP port (Mailpit in dev: 1025)
 * @param from          the From header
 * @param publicBaseUrl where links in emails point, for example http://localhost:5190
 */
@ConfigurationProperties("app.mail")
public record NotifyProperties(
        boolean enabled,
        String host,
        int port,
        String from,
        String publicBaseUrl) {

    public NotifyProperties {
        host = host == null || host.isBlank() ? "localhost" : host;
        port = port <= 0 ? 1025 : port;
        from = from == null || from.isBlank() ? "My-Trove <no-reply@localhost>" : from;
        publicBaseUrl = publicBaseUrl == null || publicBaseUrl.isBlank() ? "http://localhost:5190" : publicBaseUrl;
    }
}
