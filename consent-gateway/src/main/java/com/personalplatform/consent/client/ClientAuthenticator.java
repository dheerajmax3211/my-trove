package com.personalplatform.consent.client;

import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Verifies client id + secret. For an unknown client id it still performs a hash comparison against a dummy hash, so
 * response time does not reveal which client ids exist. The secret is never logged.
 */
@Component
public class ClientAuthenticator {

    private static final Logger LOG = LoggerFactory.getLogger(ClientAuthenticator.class);

    private final ClientRepository clients;
    private final PasswordEncoder encoder;
    private final String dummyHash;

    public ClientAuthenticator(ClientRepository clients, PasswordEncoder clientSecretEncoder) {
        this.clients = clients;
        this.encoder = clientSecretEncoder;
        this.dummyHash = clientSecretEncoder.encode("dummy-secret-for-constant-time-checks");
    }

    public Optional<ClientRecord> authenticate(String clientId, String secret) {
        if (clientId == null || secret == null || clientId.isBlank() || secret.isEmpty() || clientId.length() > 64
                || secret.length() > 256) {
            return Optional.empty();
        }
        Optional<ClientRecord> client = clients.findByClientId(clientId);
        boolean matches = encoder.matches(secret, client.map(ClientRecord::secretHash).orElse(dummyHash));
        if (client.isPresent() && matches && client.get().isActive()) {
            return client;
        }
        LOG.warn("Client authentication failed for client_id={}", sanitize(clientId));
        return Optional.empty();
    }

    private static String sanitize(String s) {
        return s.matches("[A-Za-z0-9_\\-]{1,64}") ? s : "<malformed>";
    }
}
