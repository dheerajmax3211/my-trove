package com.personalplatform.auth.token;

import com.personalplatform.auth.common.ApiException;
import com.personalplatform.auth.user.AuthUser;
import com.personalplatform.auth.user.UserService;
import java.util.Optional;
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

    public TokenController(UserService users, PlatformTokenIssuer issuer) {
        this.users = users;
        this.issuer = issuer;
    }

    @PostMapping("/exchange")
    public ResponseEntity<ExchangeResponse> exchange(@AuthenticationPrincipal Jwt jwt) {
        AuthUser user = users.resolve(jwt);
        if (user.suspended()) {
            throw ApiException.forbidden("USER_SUSPENDED", "This account is suspended");
        }
        String token = issuer.issue(user, Optional.empty());
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new ExchangeResponse(token, PlatformTokenIssuer.TTL.toSeconds(), "Bearer"));
    }
}
