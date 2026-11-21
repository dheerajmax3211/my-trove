package com.personalplatform.consent.token;

import com.personalplatform.consent.client.ClientAuthenticator;
import com.personalplatform.consent.client.ClientRecord;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * OAuth2-style endpoints for clients (RFC 6749 client_credentials, RFC 7662 introspection, RFC 7009 revocation).
 * Clients authenticate with HTTP Basic or {@code client_id}/{@code client_secret} form fields.
 * The client token returned here is only used to create requests and exchange grants; data needs an access token.
 */
@RestController
@RequestMapping("/v1/oauth")
public class OAuthController {

    private final ClientAuthenticator authenticator;
    private final TokenService tokens;
    private final Clock clock;

    public OAuthController(ClientAuthenticator authenticator, TokenService tokens, Clock clock) {
        this.authenticator = authenticator;
        this.tokens = tokens;
        this.clock = clock;
    }

    @PostMapping(value = "/token", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<Map<String, Object>> token(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestParam(name = "grant_type", required = false) String grantType,
            @RequestParam(name = "client_id", required = false) String clientId,
            @RequestParam(name = "client_secret", required = false) String clientSecret) {
        if (!"client_credentials".equals(grantType)) {
            return error(HttpStatus.BAD_REQUEST, "unsupported_grant_type");
        }
        Optional<ClientRecord> client = authenticate(authorization, clientId, clientSecret);
        if (client.isEmpty()) {
            return invalidClient();
        }
        TokenService.IssuedToken t = tokens.issueClientToken(client.get());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("access_token", t.token());
        body.put("token_type", "Bearer");
        body.put("expires_in", t.expiresInSeconds(clock.instant()));
        body.put("scope", t.scope());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @PostMapping(value = "/introspect", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<Map<String, Object>> introspect(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestParam(name = "token", required = false) String token,
            @RequestParam(name = "client_id", required = false) String clientId,
            @RequestParam(name = "client_secret", required = false) String clientSecret) {
        Optional<ClientRecord> client = authenticate(authorization, clientId, clientSecret);
        if (client.isEmpty()) {
            return invalidClient();
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(tokens.introspect(token, client.get()));
    }

    @PostMapping(value = "/revoke", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public ResponseEntity<Void> revoke(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestParam(name = "token", required = false) String token,
            @RequestParam(name = "client_id", required = false) String clientId,
            @RequestParam(name = "client_secret", required = false) String clientSecret) {
        Optional<ClientRecord> client = authenticate(authorization, clientId, clientSecret);
        if (client.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .header(HttpHeaders.WWW_AUTHENTICATE, "Basic realm=\"consent-gateway\"")
                    .build();
        }
        tokens.revoke(token, client.get());
        return ResponseEntity.ok().build();
    }

    private Optional<ClientRecord> authenticate(String authorization, String formId, String formSecret) {
        String id = formId;
        String secret = formSecret;
        if (authorization != null && authorization.regionMatches(true, 0, "Basic ", 0, 6)) {
            try {
                String decoded = new String(Base64.getDecoder().decode(authorization.substring(6).trim()), StandardCharsets.UTF_8);
                int idx = decoded.indexOf(':');
                if (idx > 0) {
                    id = decoded.substring(0, idx);
                    secret = decoded.substring(idx + 1);
                }
            } catch (IllegalArgumentException e) {
                return Optional.empty();
            }
        }
        return authenticator.authenticate(id, secret);
    }

    private static ResponseEntity<Map<String, Object>> invalidClient() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .header(HttpHeaders.WWW_AUTHENTICATE, "Basic realm=\"consent-gateway\"")
                .cacheControl(CacheControl.noStore())
                .body(Map.of("error", "invalid_client"));
    }

    private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String code) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(Map.of("error", code));
    }
}
