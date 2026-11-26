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
 * @param username      SMTP login; blank means the relay accepts mail without authentication (Mailpit, a local relay)
 * @param password      SMTP password; never logged ({@link #toString()} redacts it)
 * @param starttls      require STARTTLS before authenticating (port 587 relays such as Brevo, SES, Gmail)
 */
@ConfigurationProperties("app.mail")
public record NotifyProperties(
        boolean enabled,
        String host,
        int port,
        String from,
        String publicBaseUrl,
        String username,
        String password,
        boolean starttls) {

    public NotifyProperties {
        host = host == null || host.isBlank() ? "localhost" : host;
        port = port <= 0 ? 1025 : port;
        from = from == null || from.isBlank() ? "My-Trove <no-reply@localhost>" : from;
        publicBaseUrl = publicBaseUrl == null || publicBaseUrl.isBlank() ? "http://localhost:5190" : publicBaseUrl;
        username = username == null || username.isBlank() ? null : username;
        password = password == null || password.isEmpty() ? null : password;
    }

    public boolean authenticates() {
        return username != null;
    }

    @Override
    public String toString() {
        return "NotifyProperties[enabled=" + enabled + ", host=" + host + ", port=" + port + ", from=" + from
                + ", publicBaseUrl=" + publicBaseUrl + ", username=" + username
                + ", password=" + (password == null ? "none" : "[redacted]") + ", starttls=" + starttls + "]";
    }
}
