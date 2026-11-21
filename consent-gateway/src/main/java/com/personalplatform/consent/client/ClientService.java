package com.personalplatform.consent.client;

import com.personalplatform.consent.audit.AuditEvent;
import com.personalplatform.consent.audit.AuditService;
import com.personalplatform.consent.common.ApiException;
import com.personalplatform.consent.consent.GrantRepository;
import com.personalplatform.consent.policy.Scope;
import com.personalplatform.consent.token.TokenRepository;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ClientService {

    /** The secret is returned exactly once, at registration or rotation. */
    public record ClientWithSecret(ClientRecord client, String clientSecret) {
        @Override
        public String toString() {
            return "ClientWithSecret[client=" + client + ", clientSecret=<redacted>]";
        }
    }

    private static final SecureRandom RANDOM = new SecureRandom();

    private final ClientRepository clients;
    private final GrantRepository grants;
    private final TokenRepository tokens;
    private final AuditService audit;
    private final PasswordEncoder encoder;
    private final Clock clock;

    public ClientService(
            ClientRepository clients,
            GrantRepository grants,
            TokenRepository tokens,
            AuditService audit,
            PasswordEncoder clientSecretEncoder,
            Clock clock) {
        this.clients = clients;
        this.grants = grants;
        this.tokens = tokens;
        this.audit = audit;
        this.encoder = clientSecretEncoder;
        this.clock = clock;
    }

    @Transactional
    public ClientWithSecret register(
            String owner, String name, String contactEmail, String redirectUri, List<String> allowedScopes) {
        List<String> scopes = canonicalScopes(allowedScopes);
        String clientId = "cl_" + randomToken(16);
        String secret = "cs_" + randomToken(32);
        clients.insert(clientId, owner, name.trim(), blankToNull(contactEmail), blankToNull(redirectUri), scopes,
                encoder.encode(secret), now());
        audit.append(owner, AuditEvent.CLIENT_REGISTERED, "OWNER", owner, clientId, null,
                Map.of("name", name.trim(), "allowedScopes", scopes));
        return new ClientWithSecret(clients.findByClientId(clientId).orElseThrow(), secret);
    }

    @Transactional(readOnly = true)
    public List<ClientRecord> list(String owner) {
        return clients.listForOwner(owner);
    }

    @Transactional(readOnly = true)
    public ClientRecord get(String owner, String clientId) {
        return clients.findForOwner(owner, clientId).orElseThrow(() -> ApiException.notFound("Client"));
    }

    @Transactional
    public ClientWithSecret rotateSecret(String owner, String clientId) {
        ClientRecord c = get(owner, clientId);
        if (!c.isActive()) {
            throw ApiException.conflict("CLIENT_DISABLED", "Client is disabled");
        }
        String secret = "cs_" + randomToken(32);
        clients.updateSecret(c.pk(), encoder.encode(secret), now());
        audit.append(owner, AuditEvent.CLIENT_SECRET_ROTATED, "OWNER", owner, clientId, null, Map.of());
        return new ClientWithSecret(clients.findByClientId(clientId).orElseThrow(), secret);
    }

    /** Disables the client, revokes all its grants and tokens. Takes effect on the next request. */
    @Transactional
    public void disable(String owner, String clientId) {
        ClientRecord c = get(owner, clientId);
        OffsetDateTime now = now();
        if (!clients.disable(c.pk(), now)) {
            return; // already disabled: idempotent
        }
        List<UUID> revoked = grants.revokeAllForClient(c.pk(), now);
        tokens.revokeAllForClient(c.pk(), now);
        audit.append(owner, AuditEvent.CLIENT_DISABLED, "OWNER", owner, clientId, null,
                Map.of("grantsRevoked", revoked.size()));
        for (UUID grantId : revoked) {
            audit.append(owner, AuditEvent.GRANT_REVOKED, "OWNER", owner, clientId, grantId,
                    Map.of("cause", "CLIENT_DISABLED"));
        }
    }

    /** Active client for a verified gateway token subject; empty if unknown or disabled. */
    @Transactional(readOnly = true)
    public ClientRecord requireActive(String clientId) {
        return clients.findByClientId(clientId)
                .filter(ClientRecord::isActive)
                .orElseThrow(() -> new ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED, "INVALID_CLIENT", "Unknown or disabled client"));
    }

    public static List<String> canonicalScopes(List<String> scopes) {
        if (scopes == null || scopes.isEmpty()) {
            throw ApiException.badRequest("at least one scope is required");
        }
        return scopes.stream().map(s -> Scope.parse(s.trim()).toString()).distinct().sorted().toList();
    }

    private static String randomToken(int bytes) {
        byte[] b = new byte[bytes];
        RANDOM.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private OffsetDateTime now() {
        return clock.instant().atOffset(ZoneOffset.UTC);
    }
}
