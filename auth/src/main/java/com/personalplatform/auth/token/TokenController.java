package com.personalplatform.auth.token;

import com.personalplatform.auth.common.ApiException;
import com.personalplatform.auth.user.AuthUser;
import com.personalplatform.auth.user.UserService;
import java.util.Optional;
import java.util.UUID;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Exchanges a verified Firebase ID token for a short-lived platform token (design 5.3). */
@RestController
@RequestMapping("/v1/token")
public class TokenController {

    public record ExchangeResponse(String accessToken, long expiresIn, String tokenType) {}

    private final UserService users;
    private final PlatformTokenIssuer issuer;
    private final ApiKeyVerifier apiKeys;

    public TokenController(UserService users, PlatformTokenIssuer issuer, ApiKeyVerifier apiKeys) {
        this.users = users;
        this.issuer = issuer;
        this.apiKeys = apiKeys;
    }

    /**
     * Firebase ID token in, platform token out. {@code Authorization: Bearer pk_...} in, service token out (W4): the
     * platform service verifies the key and the token carries exactly the key's scopes and permissions.
     */
    @PostMapping("/exchange")
    public ResponseEntity<ExchangeResponse> exchange(@AuthenticationPrincipal Jwt jwt, HttpServletRequest request) {
        Optional<String> presentedKey = ApiKeyBearer.presented(request);
        if (presentedKey.isPresent()) {
            return exchangeApiKey(presentedKey.get());
        }
        AuthUser user = users.resolve(jwt);
        if (user.suspended()) {
            throw ApiException.forbidden("USER_SUSPENDED", "This account is suspended");
        }
        String token = issuer.issue(user, Optional.empty());
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new ExchangeResponse(token, PlatformTokenIssuer.TTL.toSeconds(), "Bearer"));
    }

    private ResponseEntity<ExchangeResponse> exchangeApiKey(String presentedKey) {
        VerifiedApiKey key;
        try {
            key = apiKeys.verify(presentedKey);
        } catch (InvalidApiKeyException e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "API_KEY_INVALID", e.getMessage());
        } catch (ApiKeyServiceUnavailableException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "API_KEY_SERVICE_UNAVAILABLE", e.getMessage());
        }
        AuthUser owner = ownerOf(key)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "API_KEY_INVALID",
                        "The API key is invalid, expired or revoked"));
        if (owner.suspended()) {
            throw ApiException.forbidden("USER_SUSPENDED", "This account is suspended");
        }
        String token = issuer.issueService(key, owner.plan());
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new ExchangeResponse(token, PlatformTokenIssuer.TTL.toSeconds(), "Bearer"));
    }

    private Optional<AuthUser> ownerOf(VerifiedApiKey key) {
        try {
            return users.findById(UUID.fromString(key.ownerUid()));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
