package com.personalplatform.platform.developer;

import com.personalplatform.platform.developer.ApiKeyDtos.Issued;
import com.personalplatform.platform.developer.ApiKeyDtos.IssueRequest;
import com.personalplatform.platform.developer.ApiKeyDtos.KeyView;
import com.personalplatform.platform.developer.ApiKeyDtos.Verified;
import com.personalplatform.platform.developer.ApiKeyRepository.Row;
import com.personalplatform.platform.web.BadRequestException;
import com.personalplatform.sql.UuidV7;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * API keys: issue (the value is returned once), list, revoke, and verify. A key is {@code pk_<8 hex>_<secret>}; the
 * first eleven characters find the row, and only the SHA-256 of the whole key is compared (in constant time).
 */
@Service
class ApiKeyService {

    static final String KEY_PREFIX_TAG = "pk_";
    /** Characters of the key that identify its row: "pk_" + 8 hex. */
    static final int PREFIX_LENGTH = 11;
    static final String DEFAULT_PLAN = "FREE";
    static final int DEFAULT_PLAN_LIMIT = 3;
    /** last_used_at is written at most this often per key. */
    static final Duration LAST_USED_RESOLUTION = Duration.ofMinutes(1);

    private final ApiKeyRepository keys;
    private final DeveloperAppRepository apps;
    private final Clock clock;

    ApiKeyService(ApiKeyRepository keys, DeveloperAppRepository apps, Clock clock) {
        this.keys = keys;
        this.apps = apps;
        this.clock = clock;
    }

    @Transactional
    Issued issue(String owner, String plan, UUID appId, IssueRequest request) {
        DeveloperAppRepository.Row app = apps.findOwned(owner, appId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No developer app with id " + appId));
        if (app.revokedAt() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This app is revoked");
        }
        List<String> scopes = validScopes(request.scopes());
        OffsetDateTime now = now();
        OffsetDateTime expiresAt = null;
        if (request.expiresAt() != null) {
            if (!request.expiresAt().isAfter(clock.instant())) {
                throw new BadRequestException("expiresAt must be in the future");
            }
            expiresAt = request.expiresAt().atOffset(ZoneOffset.UTC);
        }
        enforcePlanLimit(owner, plan);

        UUID id = UuidV7.next();
        String prefix = KEY_PREFIX_TAG + Secrets.randomHex(4);
        String key = prefix + "_" + Secrets.randomUrlSafe(32);
        String name = request.name().strip();
        keys.insert(id, appId, owner, name, prefix, Secrets.sha256Hex(key), now, expiresAt, scopes);
        return new Issued(id, appId, name, prefix, key, scopes, now, expiresAt);
    }

    List<KeyView> list(String owner, UUID appId) {
        apps.findOwned(owner, appId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No developer app with id " + appId));
        return keys.findByApp(appId).stream().map(ApiKeyService::view).toList();
    }

    @Transactional
    void revoke(String owner, UUID keyId) {
        Row row = keys.findOwned(owner, keyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No API key with id " + keyId));
        keys.revoke(row.id(), now());
    }

    /**
     * The key's identity and permissions for the gateway's token exchange. Every refusal is the same 401, so a caller
     * cannot tell a wrong secret from an unknown, expired or revoked key.
     */
    @Transactional
    Verified verify(String presented) {
        Row row = lookup(presented).orElseThrow(ApiKeyService::refused);
        OffsetDateTime now = now();
        if (row.revokedAt() != null || row.appRevokedAt() != null || (row.expiresAt() != null && !row.expiresAt().isAfter(now))) {
            throw refused();
        }
        if (row.lastUsedAt() == null || row.lastUsedAt().isBefore(now.minus(LAST_USED_RESOLUTION))) {
            keys.touchLastUsed(row.id(), now);
        }
        return new Verified(row.id(), row.appId(), row.ownerUid(), row.scopes(),
                ScopeCatalogue.permissionsFor(row.scopes()), row.expiresAt());
    }

    /**
     * The key's current state by id (no secret involved), so auth can refuse to delegate for a key that was revoked,
     * expired or whose app was disabled after its service token was minted. Unknown ids are 404.
     */
    ApiKeyDtos.KeyStatus status(UUID keyId) {
        Row row = keys.findById(keyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No API key with id " + keyId));
        ApiKeyDtos.KeyState state;
        if (row.revokedAt() != null) {
            state = ApiKeyDtos.KeyState.REVOKED;
        } else if (row.appRevokedAt() != null) {
            state = ApiKeyDtos.KeyState.APP_DISABLED;
        } else if (row.expiresAt() != null && !row.expiresAt().isAfter(now())) {
            state = ApiKeyDtos.KeyState.EXPIRED;
        } else {
            state = ApiKeyDtos.KeyState.ACTIVE;
        }
        return new ApiKeyDtos.KeyStatus(row.id(), row.appId(), row.ownerUid(), state,
                ScopeCatalogue.permissionsFor(row.scopes()));
    }

    private java.util.Optional<Row> lookup(String presented) {
        if (presented == null || presented.length() <= PREFIX_LENGTH || !presented.startsWith(KEY_PREFIX_TAG)
                || presented.charAt(PREFIX_LENGTH) != '_') {
            return java.util.Optional.empty();
        }
        String prefix = presented.substring(0, PREFIX_LENGTH);
        return keys.findByPrefix(prefix).filter(row -> MessageDigest.isEqual(
                row.keyHash().getBytes(java.nio.charset.StandardCharsets.UTF_8),
                Secrets.sha256Hex(presented).getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }

    private void enforcePlanLimit(String owner, String plan) {
        String effectivePlan = plan == null || plan.isBlank() ? DEFAULT_PLAN : plan;
        int limit = keys.maxApiKeys(effectivePlan).orElseGet(() -> keys.maxApiKeys(DEFAULT_PLAN).orElse(DEFAULT_PLAN_LIMIT));
        if (keys.countActive(owner) >= limit) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Your " + effectivePlan + " plan allows " + limit
                    + " active API keys; revoke one first");
        }
    }

    private static List<String> validScopes(List<String> requested) {
        List<String> distinct = requested.stream().distinct().toList();
        for (String scope : distinct) {
            if (ScopeCatalogue.find(scope).isEmpty()) {
                throw new BadRequestException("unknown scope '" + scope + "'");
            }
        }
        return distinct;
    }

    private OffsetDateTime now() {
        return clock.instant().atOffset(ZoneOffset.UTC);
    }

    private static ResponseStatusException refused() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "The API key is invalid, expired or revoked");
    }

    static KeyView view(Row r) {
        return new KeyView(r.id(), r.appId(), r.name(), r.keyPrefix(), r.scopes(), r.createdAt(), r.lastUsedAt(),
                r.expiresAt(), r.revokedAt());
    }
}
