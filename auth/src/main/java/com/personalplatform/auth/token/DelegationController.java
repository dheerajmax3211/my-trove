package com.personalplatform.auth.token;

import com.personalplatform.auth.common.ApiException;
import com.personalplatform.auth.token.ServiceTokenVerifier.InvalidServiceTokenException;
import com.personalplatform.auth.token.ServiceTokenVerifier.ServiceToken;
import com.personalplatform.auth.user.AuthUser;
import com.personalplatform.auth.user.UserService;
import java.time.Clock;
import java.util.Set;
import java.util.TreeSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /internal/v1/token/delegate}: a platform service (today only mcp-server) that holds an API key's service
 * token, and the internal key, gets a short-lived user-shaped token for the key's owner. Guarded by the internal chain
 * ({@code X-Internal-Key}); the gateway never forwards {@code /internal/**}.
 *
 * <p>Permissions are (owner's current permissions) AND (the service token's permissions) AND (the key's current
 * permissions), so the token never holds more than the owner or the key. Refused when the service token is not ours
 * or expired, the key is unknown, revoked or expired, its app is disabled, the token's app or owner no longer match
 * the key, or the owner is unknown or suspended.
 */
@RestController
@RequestMapping("/internal/v1/token")
class DelegationController {

    record DelegateRequest(String serviceToken) {}

    record DelegateResponse(String accessToken, long expiresIn, String tokenType, String ownerUid, String appId) {}

    private static final Logger log = LoggerFactory.getLogger(DelegationController.class);

    private final ServiceTokenVerifier serviceTokens;
    private final ApiKeyVerifier apiKeys;
    private final UserService users;
    private final PlatformTokenIssuer issuer;
    private final Clock clock;

    DelegationController(ServiceTokenVerifier serviceTokens, ApiKeyVerifier apiKeys, UserService users,
            PlatformTokenIssuer issuer, Clock clock) {
        this.serviceTokens = serviceTokens;
        this.apiKeys = apiKeys;
        this.users = users;
        this.issuer = issuer;
        this.clock = clock;
    }

    @PostMapping("/delegate")
    ResponseEntity<DelegateResponse> delegate(@RequestBody(required = false) DelegateRequest request) {
        ServiceToken token;
        try {
            token = serviceTokens.verify(request == null ? null : request.serviceToken());
        } catch (InvalidServiceTokenException e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "SERVICE_TOKEN_INVALID",
                    "The service token is invalid or expired");
        }
        ApiKeyStatus key;
        try {
            key = apiKeys.status(token.keyId());
        } catch (InvalidApiKeyException e) {
            throw refused("API_KEY_REVOKED", "The API key no longer exists");
        } catch (ApiKeyServiceUnavailableException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "API_KEY_SERVICE_UNAVAILABLE", e.getMessage());
        }
        switch (key.state()) {
            case ACTIVE -> { }
            case REVOKED -> throw refused("API_KEY_REVOKED", "The API key is revoked");
            case EXPIRED -> throw refused("API_KEY_EXPIRED", "The API key has expired");
            case APP_DISABLED -> throw refused("APP_DISABLED", "The API key's app is disabled");
        }
        if (!key.appId().equals(token.appId()) || !key.ownerUid().equals(token.ownerUid().toString())) {
            throw refused("API_KEY_MISMATCH", "The service token does not match its API key");
        }
        AuthUser owner = users.findById(token.ownerUid())
                .orElseThrow(() -> refused("OWNER_UNKNOWN", "The API key's owner does not exist"));
        if (owner.suspended()) {
            throw refused("USER_SUSPENDED", "The API key's owner is suspended");
        }
        Set<String> permissions = new TreeSet<>(owner.permissions());
        permissions.retainAll(token.permissions());
        permissions.retainAll(key.permissions());

        String accessToken = issuer.issueDelegated(owner, permissions, token.appId(), token.keyId(), token.expiresAt());
        long expiresIn = Math.max(0, java.time.Duration.between(clock.instant(),
                java.time.Instant.ofEpochSecond(expirySeconds(accessToken))).toSeconds());
        log.info("delegated token issued: app {} key {} acting for user {} with {}", token.appId(), token.keyId(),
                owner.id(), permissions);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new DelegateResponse(accessToken, expiresIn, "Bearer", owner.id().toString(),
                        token.appId().toString()));
    }

    private static long expirySeconds(String jwt) {
        try {
            return com.nimbusds.jwt.SignedJWT.parse(jwt).getJWTClaimsSet().getExpirationTime().toInstant().getEpochSecond();
        } catch (java.text.ParseException e) {
            throw new IllegalStateException(e);
        }
    }

    private static ApiException refused(String code, String message) {
        return ApiException.forbidden(code, message);
    }
}
