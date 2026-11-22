package com.personalplatform.platform.developer;

import com.personalplatform.platform.developer.DeveloperAppDtos.App;
import com.personalplatform.platform.developer.DeveloperAppDtos.AppRequest;
import com.personalplatform.platform.developer.DeveloperAppDtos.Created;
import com.personalplatform.platform.developer.DeveloperAppDtos.SecretRotated;
import com.personalplatform.platform.developer.DeveloperAppRepository.Row;
import com.personalplatform.sql.UuidV7;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Developer app lifecycle. Every operation is scoped to the owner: another developer's app is reported as not found,
 * never as forbidden, so app ids cannot be probed.
 */
@Service
class DeveloperAppService {

    static final String CLIENT_ID_PREFIX = "app_";
    static final String CLIENT_SECRET_PREFIX = "cs_";

    private final DeveloperAppRepository repository;
    private final Clock clock;

    DeveloperAppService(DeveloperAppRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Transactional
    Created create(String owner, AppRequest request) {
        String name = request.name().strip();
        String description = request.description() == null ? "" : request.description().strip();
        List<String> uris = RedirectUris.validate(request.redirectUris());
        UUID id = UuidV7.next();
        String clientId = CLIENT_ID_PREFIX + Secrets.randomHex(12);
        String secret = CLIENT_SECRET_PREFIX + Secrets.randomUrlSafe(32);
        OffsetDateTime now = now();
        repository.insert(id, owner, name, description, clientId, Secrets.sha256Hex(secret), now, uris);
        return new Created(id, clientId, secret, name, description, uris, now);
    }

    List<App> list(String owner) {
        return repository.findByOwner(owner).stream().map(DeveloperAppService::view).toList();
    }

    App get(String owner, UUID id) {
        return view(owned(owner, id));
    }

    @Transactional
    App update(String owner, UUID id, AppRequest request) {
        owned(owner, id);
        String name = request.name().strip();
        String description = request.description() == null ? "" : request.description().strip();
        List<String> uris = RedirectUris.validate(request.redirectUris());
        Row updated = repository.update(id, owner, name, description, uris, now())
                .orElseThrow(() -> notFound(id));
        return view(updated);
    }

    /** A new secret; the old one stops matching at once. Revoked apps cannot get a secret. */
    @Transactional
    SecretRotated rotate(String owner, UUID id) {
        Row app = owned(owner, id);
        if (app.revokedAt() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This app is revoked");
        }
        String secret = CLIENT_SECRET_PREFIX + Secrets.randomUrlSafe(32);
        OffsetDateTime now = now();
        repository.setSecret(id, owner, Secrets.sha256Hex(secret), now);
        return new SecretRotated(id, app.clientId(), secret, now);
    }

    /** Clears the stored digest, so the current secret matches nothing. A new one needs a rotate. */
    @Transactional
    void revokeSecret(String owner, UUID id) {
        owned(owner, id);
        repository.setSecret(id, owner, null, now());
    }

    /** Revokes the app. Its keys and webhooks stop working with it (their own revocation is applied by those services). */
    @Transactional
    void delete(String owner, UUID id) {
        owned(owner, id);
        repository.markRevoked(id, now());
    }

    private Row owned(String owner, UUID id) {
        return repository.findOwned(owner, id).orElseThrow(() -> notFound(id));
    }

    private OffsetDateTime now() {
        return clock.instant().atOffset(ZoneOffset.UTC);
    }

    private static ResponseStatusException notFound(UUID id) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "No developer app with id " + id);
    }

    static App view(Row r) {
        return new App(r.id(), r.clientId(), r.name(), r.description(), r.redirectUris(), r.hasClientSecret(),
                r.secretRotatedAt(), r.createdAt(), r.updatedAt(), r.revokedAt());
    }
}
